import type { TranscriptChunk } from '@/types';
import { pcm16kToWavBytes } from '@/utils/audioUtils';

const SAMPLE_RATE = 16_000;
const SEGMENT_SECONDS = 60;
const HF_ENDPOINT =
  'https://router.huggingface.co/hf-inference/models/openai/whisper-large-v3';

export interface HfTranscribeOptions {
  token: string;
  onPartialText?: (text: string) => void;
  onProgress?: (percent: number) => void;
  /** Injectable for tests; defaults to global fetch. */
  fetchImpl?: typeof fetch;
}

interface HfResponse {
  text?: string;
  chunks?: Array<{ text: string; timestamp: [number, number | null] }>;
}

/**
 * Hosted-transcription failure carrying the HTTP status when one was received.
 * `status` is undefined for network/CORS/parse failures, which never reach a response.
 */
export class HfTranscribeError extends Error {
  readonly status?: number;

  constructor(message: string, status?: number) {
    super(message);
    this.name = 'HfTranscribeError';
    this.status = status;
  }
}

// Deliberately model-name-free: the local worker's model has drifted before (base → small)
// and a hardcoded name here silently lies when it drifts again.
const FALLBACK_SUFFIX = 'Transcribed with the on-device model instead (lower accuracy).';

/**
 * Maps a hosted-transcription failure to a single user-facing sentence explaining what went
 * wrong and that the local fallback took over. Pure — safe to unit test and to call from render.
 */
export function describeHfFailure(error: unknown): string {
  const status = error instanceof HfTranscribeError ? error.status : undefined;

  let cause: string;
  if (status === 401 || status === 403) {
    cause = `Hugging Face rejected your token (HTTP ${status}). Check or clear it above.`;
  } else if (status === 429) {
    cause = 'Hugging Face rate limit reached (HTTP 429). Try again later.';
  } else if (status === 503) {
    cause = 'The hosted model is loading or temporarily unavailable (HTTP 503).';
  } else if (status !== undefined) {
    cause = `Hugging Face returned HTTP ${status}.`;
  } else {
    cause = 'Could not reach Hugging Face — check your network connection.';
  }

  return `${cause} ${FALLBACK_SUFFIX}`;
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  // Chunk the conversion so String.fromCharCode never blows the call stack on large slices.
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

/**
 * Transcribes a 16 kHz mono waveform via the Hugging Face hosted Inference API by
 * POSTing ~60s slices in sequence. Emits accumulated text per slice (progressive
 * display) and returns the aggregated text + timestamp chunks. Throws on any HTTP or
 * network failure so the caller can fall back to the local worker.
 */
export async function transcribeViaHf(
  pcm: Float32Array,
  options: HfTranscribeOptions
): Promise<{ text: string; chunks: TranscriptChunk[] }> {
  const doFetch = options.fetchImpl ?? fetch;
  const segmentSamples = SEGMENT_SECONDS * SAMPLE_RATE;
  const totalSegments = Math.max(1, Math.ceil(pcm.length / segmentSamples));

  let fullText = '';
  const allChunks: TranscriptChunk[] = [];

  for (let i = 0; i < totalSegments; i++) {
    const start = i * segmentSamples;
    const slice = pcm.subarray(start, Math.min(start + segmentSamples, pcm.length));
    const offsetSeconds = start / SAMPLE_RATE;

    const base64 = bytesToBase64(pcm16kToWavBytes(slice));

    const response = await doFetch(HF_ENDPOINT, {
      method: 'POST',
      // A hung request must not wedge the job — Reset is disabled while converting.
      // Generous budget: hosted whisper-large-v3 on a 60s slice can be slow when cold.
      signal: AbortSignal.timeout(120_000),
      headers: {
        Authorization: `Bearer ${options.token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ inputs: base64, parameters: { return_timestamps: true } }),
    });

    if (!response.ok) {
      const detail = await response.text().catch(() => '');
      throw new HfTranscribeError(
        `HF hosted transcription failed (${response.status}). ${detail}`.trim(),
        response.status
      );
    }

    const data = (await response.json()) as HfResponse;
    const text = (data.text ?? '').trim();
    if (text) {
      fullText += (fullText ? ' ' : '') + text;
      options.onPartialText?.(fullText);
    }
    for (const chunk of data.chunks ?? []) {
      const [chunkStart, chunkEnd] = chunk.timestamp;
      allChunks.push({
        text: chunk.text,
        timestamp: [
          (chunkStart ?? 0) + offsetSeconds,
          chunkEnd == null ? null : chunkEnd + offsetSeconds,
        ],
      });
    }

    options.onProgress?.(Math.round(((i + 1) / totalSegments) * 100));
  }

  return { text: fullText, chunks: allChunks };
}
