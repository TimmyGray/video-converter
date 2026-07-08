import { pipeline, env, type AutomaticSpeechRecognitionPipeline } from '@huggingface/transformers';
import type { TranscriptChunk } from '@/types';

// Load model weights from the Hugging Face CDN (cached by the browser after first run).
env.allowLocalModels = false;

const MODEL_ID = 'onnx-community/whisper-base';

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
  | { type: 'result'; id: number; text: string; chunks: TranscriptChunk[] }
  | { type: 'error'; id: number; message: string };

const ctx = globalThis as unknown as {
  postMessage: (message: WorkerOutbound) => void;
  addEventListener: (type: 'message', listener: (event: MessageEvent<TranscribeRequest>) => void) => void;
  navigator?: { gpu?: unknown };
};

let transcriberPromise: Promise<AutomaticSpeechRecognitionPipeline> | null = null;

function loadTranscriber(
  onProgress: (data: ProgressPayload) => void
): Promise<AutomaticSpeechRecognitionPipeline> {
  if (!transcriberPromise) {
    const useWebGpu = Boolean(ctx.navigator?.gpu);
    const device = useWebGpu ? 'webgpu' : 'wasm';
    // fp32 encoder + 4-bit decoder is the recommended WebGPU profile; q8 keeps the
    // WASM fallback small and fast enough on CPU.
    const dtype = useWebGpu ? { encoder_model: 'fp32' as const, decoder_model_merged: 'q4' as const } : 'q8';

    transcriberPromise = pipeline('automatic-speech-recognition', MODEL_ID, {
      device,
      dtype,
      progress_callback: (item) => onProgress(item as ProgressPayload),
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

    const output = (await transcriber(audio, {
      chunk_length_s: 30,
      stride_length_s: 5,
      return_timestamps: true,
      language: language ?? undefined,
      task: translate ? 'translate' : 'transcribe',
    })) as { text: string; chunks?: TranscriptChunk[] };

    ctx.postMessage({
      type: 'result',
      id,
      text: output.text ?? '',
      chunks: output.chunks ?? [],
    });
  } catch (err) {
    ctx.postMessage({
      type: 'error',
      id,
      message: err instanceof Error ? err.message : 'Transcription failed.',
    });
  }
});
