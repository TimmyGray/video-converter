import { pipeline, env, Tensor, type AutomaticSpeechRecognitionPipeline } from '@huggingface/transformers';
import type { TranscriptChunk } from '@/types';
import {
  MAX_NEW_TOKENS_PER_WINDOW,
  SAMPLE_RATE,
  SEGMENT_SAMPLES,
  SEGMENT_SECONDS,
  STRIDE_SECONDS,
  SegmentStreamer,
  RunawayGenerationError,
  WINDOW_SECONDS,
  countSegments,
  offsetChunks,
  pickLanguageDetectionWindows,
  segmentTokenBudget,
  windowsPerSegment,
} from '@/utils/transcriptionSegments';

// Load model weights from the Hugging Face CDN (cached by the browser after first run).
env.allowLocalModels = false;

// Serve the ONNX Runtime WASM binaries from our own origin (/public/ort, copied by
// scripts/prepare-onnx-assets.mjs). transformers.js otherwise defaults to a jsdelivr URL
// pinned to a *dev-prerelease* onnxruntime-web version that is not published there and is
// blocked by our COEP: require-corp header — both of which make the WASM backend fail to
// initialize with "no available backend found". A same-origin path avoids both problems.
if (env.backends?.onnx?.wasm) {
  env.backends.onnx.wasm.wasmPaths = '/ort/';
}

// whisper-small: markedly better accuracy than -base and still runs on WASM-only
// (no-GPU) clients. The device/dtype ladder below degrades gracefully if a quantized
// variant is missing, so a model swap only needs this constant to change.
const MODEL_ID = 'onnx-community/whisper-small';

/**
 * One transcription pass. `audio` starts at the boundary of segment `firstSegment` of the
 * original waveform — the main thread re-sends only the remainder when it restarts a stalled
 * worker or resumes after the hosted engine gave up — so all segment indices and timestamps
 * this worker reports are file-relative.
 */
export interface TranscribeRequest {
  type: 'transcribe';
  id: number;
  audio: Float32Array;
  firstSegment: number;
  /** Whisper language name or code; null = detect it from the audio. */
  language: string | null;
  translate: boolean;
  /** ONNX Runtime WASM thread count; null keeps the runtime default. Only applies before load. */
  numThreads: number | null;
}

type ProgressPayload = { status: string; file?: string; progress?: number; loaded?: number; total?: number };

export type SegmentSkipReason = 'runaway' | 'error';

export type WorkerOutbound =
  | { type: 'model-progress'; id: number; data: ProgressPayload }
  | { type: 'ready'; id: number }
  | { type: 'language'; id: number; language: string }
  // Liveness signal while a segment decodes; `fraction` is the share of its windows finished.
  | { type: 'heartbeat'; id: number; segment: number; fraction: number }
  | { type: 'segment'; id: number; segment: number; text: string; chunks: TranscriptChunk[] }
  | { type: 'segment-skipped'; id: number; segment: number; reason: SegmentSkipReason; message: string }
  | { type: 'done'; id: number }
  | { type: 'error'; id: number; message: string };

// Throttle for token heartbeats: frequent enough for the supervisor's stall timer, cheap enough
// not to flood the main thread with one message per decoded token.
const HEARTBEAT_INTERVAL_MS = 1_000;

interface GpuAdapterProvider {
  requestAdapter: () => Promise<unknown | null>;
}

const ctx = globalThis as unknown as {
  postMessage: (message: WorkerOutbound) => void;
  addEventListener: (type: 'message', listener: (event: MessageEvent<TranscribeRequest>) => void) => void;
  navigator?: { gpu?: GpuAdapterProvider };
};

type PipelineDevice = 'webgpu' | 'wasm';
type PipelineDtype = Record<string, string> | string;
type GraphOptimizationLevel = 'disabled' | 'basic' | 'extended' | 'all';
interface DeviceAttempt {
  device: PipelineDevice;
  dtype: PipelineDtype;
  graphOptimizationLevel?: GraphOptimizationLevel;
}

// Tried in order; the first attempt whose pipeline loads AND creates a session wins.
// - WebGPU (jsep) handles 4-bit `MatMulNBits` weights natively — fastest when a GPU exists.
// - WASM q8 with graph optimization DISABLED: the onnxruntime-web 1.26 line (dev build first,
//   now pinned to the 1.26.0 release via package.json `overrides`) has a graph-optimizer bug
//   ("TransposeDQWeightsForMatMulNBits Missing required scale") that crashes session creation
//   for this model's quantized decoder; disabling optimization sidesteps it while keeping the
//   small/fast quantized weights.
// - WASM fp32: guaranteed fallback — the unquantized decoder has no MatMulNBits nodes at all,
//   so it always creates a session (at the cost of a larger download / slower CPU inference).
const WEBGPU_ATTEMPT: DeviceAttempt = {
  device: 'webgpu',
  dtype: { encoder_model: 'fp32', decoder_model_merged: 'q4' },
};
const WASM_ATTEMPTS: DeviceAttempt[] = [
  { device: 'wasm', dtype: 'q8', graphOptimizationLevel: 'disabled' },
  { device: 'wasm', dtype: 'fp32' },
];

let transcriberPromise: Promise<AutomaticSpeechRecognitionPipeline> | null = null;

/**
 * `navigator.gpu` being present does NOT mean WebGPU works — in Chrome without hardware
 * acceleration, on Linux without a usable GPU backend, and in many web-worker contexts the
 * API exists but `requestAdapter()` resolves to `null`. We must actually acquire an adapter
 * before committing to the WebGPU backend, otherwise ONNX Runtime throws
 * "Failed to get GPU adapter / no available backend found".
 */
async function hasWebGpuAdapter(): Promise<boolean> {
  const gpu = ctx.navigator?.gpu;
  if (!gpu) return false;
  try {
    const adapter = await gpu.requestAdapter();
    return adapter != null;
  } catch {
    return false;
  }
}

async function createTranscriber(
  onProgress: (data: ProgressPayload) => void
): Promise<AutomaticSpeechRecognitionPipeline> {
  const attempts: DeviceAttempt[] = [];
  if (await hasWebGpuAdapter()) {
    attempts.push(WEBGPU_ATTEMPT);
  }
  // Always keep the WASM attempts as fallback so a WebGPU failure still yields a transcript.
  attempts.push(...WASM_ATTEMPTS);

  let lastError: unknown;
  for (const attempt of attempts) {
    try {
      return await pipeline('automatic-speech-recognition', MODEL_ID, {
        device: attempt.device,
        dtype: attempt.dtype,
        progress_callback: (item) => onProgress(item as ProgressPayload),
        ...(attempt.graphOptimizationLevel
          ? { session_options: { graphOptimizationLevel: attempt.graphOptimizationLevel } }
          : {}),
        // `dtype`/`session_options` shapes are looser here than the published types allow.
      } as Parameters<typeof pipeline>[2]);
    } catch (err) {
      lastError = err;
    }
  }

  const detail = lastError instanceof Error ? lastError.message : String(lastError);
  throw new Error(
    `Could not initialize the speech recognition engine. Last backend error: ${detail}`,
    { cause: lastError }
  );
}

function loadTranscriber(
  onProgress: (data: ProgressPayload) => void,
  numThreads: number | null
): Promise<AutomaticSpeechRecognitionPipeline> {
  if (!transcriberPromise) {
    // The thread count is read when ONNX Runtime initializes, i.e. on the first session.
    if (numThreads != null && env.backends?.onnx?.wasm) {
      env.backends.onnx.wasm.numThreads = numThreads;
    }
    transcriberPromise = createTranscriber(onProgress).catch((err) => {
      // Never cache a rejected load — otherwise every later attempt re-throws the same
      // error even when a different backend would have succeeded.
      transcriberPromise = null;
      throw err;
    });
  }

  return transcriberPromise;
}

interface WhisperGenerationConfig {
  is_multilingual?: boolean;
  lang_to_id?: Record<string, number>;
  decoder_start_token_id?: number;
}

type WhisperModelLike = ((inputs: Record<string, unknown>) => Promise<{ logits: Tensor }>) & {
  generation_config: WhisperGenerationConfig | null;
};

/**
 * Spoken-language identification. transformers.js does not implement it — with no language it
 * silently forces <|en|>, which makes Whisper "translate" non-English speech into hallucinated
 * English. This does what openai/whisper does: one decoder step after <|startoftranscript|> and
 * a softmax restricted to the language tokens, summed over the loudest few 30s windows.
 * Returns a Whisper language code (e.g. "ru"), or null when it cannot tell.
 */
async function detectLanguage(
  transcriber: AutomaticSpeechRecognitionPipeline,
  audio: Float32Array,
  onWindowDone: () => void
): Promise<string | null> {
  const model = transcriber.model as unknown as WhisperModelLike;
  const config = model.generation_config;
  if (!config?.is_multilingual || !config.lang_to_id || config.decoder_start_token_id == null) {
    return null;
  }

  const starts = pickLanguageDetectionWindows(audio);
  if (starts.length === 0) return null;

  const languages = Object.entries(config.lang_to_id);
  const totals = new Float64Array(languages.length);
  const windowSamples = WINDOW_SECONDS * SAMPLE_RATE;

  for (const start of starts) {
    const window = audio.subarray(start, start + windowSamples);
    const { input_features } = (await transcriber.processor(window)) as { input_features: Tensor };
    const { logits } = await model({
      input_features,
      decoder_input_ids: new Tensor('int64', [BigInt(config.decoder_start_token_id)], [1, 1]),
    });
    const scores = logits.data as Float32Array;

    let max = -Infinity;
    for (const [, tokenId] of languages) max = Math.max(max, scores[tokenId]);
    let sum = 0;
    const weights = languages.map(([, tokenId]) => {
      const weight = Math.exp(scores[tokenId] - max);
      sum += weight;
      return weight;
    });
    weights.forEach((weight, i) => {
      totals[i] += weight / sum;
    });
    onWindowDone();
  }

  let best = 0;
  for (let i = 1; i < totals.length; i++) if (totals[i] > totals[best]) best = i;
  const match = languages[best]?.[0].match(/^<\|([a-z-]+)\|>$/i);
  return match ? match[1] : null;
}

ctx.addEventListener('message', async (event) => {
  const request = event.data;
  if (request?.type !== 'transcribe') return;

  const { id, audio, firstSegment, translate, numThreads } = request;

  try {
    const transcriber = await loadTranscriber((data) => {
      ctx.postMessage({ type: 'model-progress', id, data });
    }, numThreads);
    ctx.postMessage({ type: 'ready', id });

    let language = request.language;
    if (!language) {
      // Each detection window is a full encoder pass; heartbeat so the supervisor's stall timer
      // does not mistake a slow CPU for a hung engine.
      language = await detectLanguage(transcriber, audio, () =>
        ctx.postMessage({ type: 'heartbeat', id, segment: firstSegment, fraction: 0 })
      );
      if (language) ctx.postMessage({ type: 'language', id, language });
    }

    const totalSegments = countSegments(audio.length);

    for (let local = 0; local < totalSegments; local++) {
      const segment = firstSegment + local;
      const start = local * SEGMENT_SAMPLES;
      const samples = audio.subarray(start, Math.min(start + SEGMENT_SAMPLES, audio.length));
      const windows = windowsPerSegment(samples.length);

      let lastHeartbeat = 0;
      const streamer = new SegmentStreamer(segmentTokenBudget(samples.length), {
        onToken: () => {
          const now = Date.now();
          if (now - lastHeartbeat < HEARTBEAT_INTERVAL_MS) return;
          lastHeartbeat = now;
          ctx.postMessage({ type: 'heartbeat', id, segment, fraction: 0 });
        },
        onWindowEnd: (windowsDone) => {
          lastHeartbeat = Date.now();
          ctx.postMessage({ type: 'heartbeat', id, segment, fraction: Math.min(1, windowsDone / windows) });
        },
      });

      let output: { text: string; chunks?: TranscriptChunk[] };
      try {
        output = (await transcriber(samples, {
          chunk_length_s: WINDOW_SECONDS,
          stride_length_s: STRIDE_SECONDS,
          return_timestamps: true,
          language: language ?? undefined,
          task: translate ? 'translate' : 'transcribe',
          // Bounds every window and bypasses transformers.js' seek loop — see the constant.
          max_new_tokens: MAX_NEW_TOKENS_PER_WINDOW,
          streamer,
          // Suppress the repetition/looping Whisper falls into on long or accented audio.
          no_repeat_ngram_size: 3,
          condition_on_prev_tokens: false,
          temperature: 0,
          // `streamer` is accepted by generate() but missing from the pipeline's option types.
        } as Record<string, unknown>)) as { text: string; chunks?: TranscriptChunk[] };
      } catch (segmentError) {
        // A single segment can fail to decode — e.g. Whisper emits no tokens for a stretch
        // of near-silence and the tokenizer throws "token_ids must be a non-empty array" — or
        // trip the runaway guard. Skip that window rather than aborting the whole transcript.
        console.warn(`[whisper.worker] segment ${segment + 1} skipped:`, segmentError);
        ctx.postMessage({
          type: 'segment-skipped',
          id,
          segment,
          reason: segmentError instanceof RunawayGenerationError ? 'runaway' : 'error',
          message: segmentError instanceof Error ? segmentError.message : String(segmentError),
        });
        continue;
      }

      ctx.postMessage({
        type: 'segment',
        id,
        segment,
        text: (output.text ?? '').trim(),
        chunks: offsetChunks(output.chunks ?? [], segment * SEGMENT_SECONDS),
      });
    }

    ctx.postMessage({ type: 'done', id });
  } catch (err) {
    ctx.postMessage({
      type: 'error',
      id,
      message: err instanceof Error ? err.message : 'Transcription failed.',
    });
  }
});
