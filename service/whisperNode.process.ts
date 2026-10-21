import os from 'node:os';
import path from 'node:path';
import { pipeline, env, Tensor, type AutomaticSpeechRecognitionPipeline } from '@huggingface/transformers';
import type { TranscriptChunk } from '@/types';
import type { TranscribeRequest, WorkerOutbound } from '@/workers/whisper.worker';
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

/**
 * Node counterpart of src/workers/whisper.worker.ts: same message protocol and segment loop, so
 * createLocalTranscriptionSession supervises it unchanged. Differs only in the runtime plumbing
 * (IPC instead of postMessage, onnxruntime-node on the CPU, a model cache outside node_modules).
 * It is a child process rather than a worker thread because terminating a thread that is inside
 * onnxruntime-node aborts the whole process (Napi::Error, exit 134), while a process can be killed.
 */
env.allowLocalModels = false;
env.cacheDir = path.join(os.homedir(), '.cache', 'videoforge', 'models');

const MODEL_ID = 'onnx-community/whisper-small';
const HEARTBEAT_INTERVAL_MS = 1_000;

const send = process.send?.bind(process);
if (!send) throw new Error('whisperNode.process must be started with child_process.fork.');
const post = (message: WorkerOutbound) => send(message);

type ProgressPayload = { status: string; file?: string; progress?: number; loaded?: number; total?: number };

const DTYPE_ATTEMPTS = ['q8', 'fp32'];

let transcriberPromise: Promise<AutomaticSpeechRecognitionPipeline> | null = null;

async function createTranscriber(
  onProgress: (data: ProgressPayload) => void,
  numThreads: number | null
): Promise<AutomaticSpeechRecognitionPipeline> {
  let lastError: unknown;
  for (const dtype of DTYPE_ATTEMPTS) {
    try {
      return await pipeline('automatic-speech-recognition', MODEL_ID, {
        device: 'cpu',
        dtype,
        progress_callback: (item) => onProgress(item as ProgressPayload),
        ...(numThreads != null ? { session_options: { intraOpNumThreads: numThreads } } : {}),
      } as Parameters<typeof pipeline>[2]);
    } catch (err) {
      lastError = err;
    }
  }
  const detail = lastError instanceof Error ? lastError.message : String(lastError);
  throw new Error(`Could not initialize the speech recognition engine. Last backend error: ${detail}`, {
    cause: lastError,
  });
}

function loadTranscriber(
  onProgress: (data: ProgressPayload) => void,
  numThreads: number | null
): Promise<AutomaticSpeechRecognitionPipeline> {
  if (!transcriberPromise) {
    transcriberPromise = createTranscriber(onProgress, numThreads).catch((err) => {
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

// transformers.js has no language identification and silently forces <|en|> when no language is
// given; this mirrors the browser worker's detectLanguage.
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

async function handleRequest(request: TranscribeRequest): Promise<void> {
  const { id, audio, firstSegment, translate, numThreads } = request;

  try {
    const transcriber = await loadTranscriber((data) => post({ type: 'model-progress', id, data }), numThreads);
    post({ type: 'ready', id });

    let language = request.language;
    if (!language) {
      language = await detectLanguage(transcriber, audio, () =>
        post({ type: 'heartbeat', id, segment: firstSegment, fraction: 0 })
      );
      if (language) post({ type: 'language', id, language });
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
          post({ type: 'heartbeat', id, segment, fraction: 0 });
        },
        onWindowEnd: (windowsDone) => {
          lastHeartbeat = Date.now();
          post({ type: 'heartbeat', id, segment, fraction: Math.min(1, windowsDone / windows) });
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
          max_new_tokens: MAX_NEW_TOKENS_PER_WINDOW,
          streamer,
          no_repeat_ngram_size: 3,
          condition_on_prev_tokens: false,
          temperature: 0,
        } as Record<string, unknown>)) as { text: string; chunks?: TranscriptChunk[] };
      } catch (segmentError) {
        post({
          type: 'segment-skipped',
          id,
          segment,
          reason: segmentError instanceof RunawayGenerationError ? 'runaway' : 'error',
          message: segmentError instanceof Error ? segmentError.message : String(segmentError),
        });
        continue;
      }

      post({
        type: 'segment',
        id,
        segment,
        text: (output.text ?? '').trim(),
        chunks: offsetChunks(output.chunks ?? [], segment * SEGMENT_SECONDS),
      });
    }

    post({ type: 'done', id });
  } catch (err) {
    post({ type: 'error', id, message: err instanceof Error ? err.message : 'Transcription failed.' });
  }
}

process.on('message', (request: TranscribeRequest) => {
  if (request?.type === 'transcribe') void handleRequest(request);
});
process.on('disconnect', () => process.exit(0));
