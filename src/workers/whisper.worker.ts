import { pipeline, env, type AutomaticSpeechRecognitionPipeline } from '@huggingface/transformers';
import type { TranscriptChunk } from '@/types';

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

export interface TranscribeRequest {
  type: 'transcribe';
  id: number;
  audio: Float32Array;
  language: string | null;
  translate: boolean;
}

type ProgressPayload = { status: string; file?: string; progress?: number; loaded?: number; total?: number };

export type WorkerOutbound =
  | { type: 'model-progress'; id: number; data: ProgressPayload }
  | { type: 'ready'; id: number }
  | { type: 'transcribe-progress'; id: number; progress: number }
  | { type: 'result'; id: number; text: string; chunks: TranscriptChunk[] }
  | { type: 'error'; id: number; message: string };

const SAMPLE_RATE = 16_000;
// Transcribe in fixed windows so we can report real progress on long files (an hour of
// audio would otherwise sit at one frozen percentage) and give each window a fresh decoder
// context, which curbs Whisper's runaway repetition on hard/accented speech.
const SEGMENT_SECONDS = 60;

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
// - WASM q8 with graph optimization DISABLED: the pinned onnxruntime-web dev build has a
//   graph-optimizer bug ("TransposeDQWeightsForMatMulNBits Missing required scale") that
//   crashes session creation for this model's quantized decoder; disabling optimization
//   sidesteps it while keeping the small/fast quantized weights.
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
  onProgress: (data: ProgressPayload) => void
): Promise<AutomaticSpeechRecognitionPipeline> {
  if (!transcriberPromise) {
    transcriberPromise = createTranscriber(onProgress).catch((err) => {
      // Never cache a rejected load — otherwise every later attempt re-throws the same
      // error even when a different backend would have succeeded.
      transcriberPromise = null;
      throw err;
    });
  }

  return transcriberPromise;
}

ctx.addEventListener('message', async (event) => {
  const request = event.data;
  if (request?.type !== 'transcribe') return;

  const { id, audio, language, translate } = request;

  try {
    const transcriber = await loadTranscriber((data) => {
      ctx.postMessage({ type: 'model-progress', id, data });
    });
    ctx.postMessage({ type: 'ready', id });

    const segmentSamples = SEGMENT_SECONDS * SAMPLE_RATE;
    const totalSegments = Math.max(1, Math.ceil(audio.length / segmentSamples));
    const allChunks: TranscriptChunk[] = [];
    let fullText = '';

    for (let i = 0; i < totalSegments; i++) {
      const start = i * segmentSamples;
      const segment = audio.subarray(start, Math.min(start + segmentSamples, audio.length));
      const offsetSeconds = start / SAMPLE_RATE;

      let output: { text: string; chunks?: TranscriptChunk[] };
      try {
        output = (await transcriber(segment, {
          chunk_length_s: 30,
          stride_length_s: 5,
          return_timestamps: true,
          language: language ?? undefined,
          task: translate ? 'translate' : 'transcribe',
          // Suppress the repetition/looping Whisper falls into on long or accented audio.
          no_repeat_ngram_size: 3,
          condition_on_prev_tokens: false,
          temperature: 0,
        })) as { text: string; chunks?: TranscriptChunk[] };
      } catch (segmentError) {
        // A single segment can fail to decode — e.g. Whisper emits no tokens for a stretch
        // of near-silence and the tokenizer throws "token_ids must be a non-empty array".
        // Skip that window rather than aborting the whole transcript.
        console.warn(`[whisper.worker] segment ${i + 1}/${totalSegments} skipped:`, segmentError);
        ctx.postMessage({ type: 'transcribe-progress', id, progress: (i + 1) / totalSegments });
        continue;
      }

      const text = (output.text ?? '').trim();
      if (text) fullText += (fullText ? ' ' : '') + text;
      for (const chunk of output.chunks ?? []) {
        const [chunkStart, chunkEnd] = chunk.timestamp;
        allChunks.push({
          text: chunk.text,
          timestamp: [
            (chunkStart ?? 0) + offsetSeconds,
            chunkEnd == null ? null : chunkEnd + offsetSeconds,
          ],
        });
      }

      ctx.postMessage({ type: 'transcribe-progress', id, progress: (i + 1) / totalSegments });
    }

    ctx.postMessage({
      type: 'result',
      id,
      text: fullText,
      chunks: allChunks,
    });
  } catch (err) {
    ctx.postMessage({
      type: 'error',
      id,
      message: err instanceof Error ? err.message : 'Transcription failed.',
    });
  }
});
