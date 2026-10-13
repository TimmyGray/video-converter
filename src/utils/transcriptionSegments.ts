import type { TranscriptChunk } from '@/types';

/**
 * Segment geometry shared by the local Whisper worker, its main-thread supervisor and the
 * hosted (Hugging Face) path. Both engines walk the waveform in the same fixed 60-second
 * segments, which is what lets a run that stopped on one engine resume on the other at an
 * exact segment boundary. Pure — no React, no worker globals — so it is unit-tested directly.
 */

export const SAMPLE_RATE = 16_000;
export const SEGMENT_SECONDS = 60;
export const SEGMENT_SAMPLES = SEGMENT_SECONDS * SAMPLE_RATE;

// Whisper's fixed receptive field, and the overlap the pipeline trims off each side of a
// window. Mirrors the `chunk_length_s` / `stride_length_s` the worker passes to transformers.js.
export const WINDOW_SECONDS = 30;
export const STRIDE_SECONDS = 5;

/**
 * Hard cap on tokens Whisper may generate per 30s window. Dense Russian speech with inline
 * timestamps lands around 220–250 tokens, so 320 leaves headroom for real speech while cutting
 * a hallucination loop off well before the model's 448-position ceiling. Setting it explicitly
 * also makes transformers.js skip its seek-based long-form loop (`_generate_with_seek`), which
 * never advances when the last timestamp pair sits at <|0.00|> and then spins forever.
 */
export const MAX_NEW_TOKENS_PER_WINDOW = 320;

/** Number of 60s segments a waveform of `sampleCount` samples is split into (at least one). */
export function countSegments(sampleCount: number): number {
  return Math.max(1, Math.ceil(sampleCount / SEGMENT_SAMPLES));
}

/**
 * Number of 30s windows the transformers.js ASR pipeline cuts a segment of `sampleCount`
 * samples into: windows start every (window − 2·stride) seconds until one reaches the end.
 */
export function windowsPerSegment(sampleCount: number): number {
  const window = WINDOW_SECONDS * SAMPLE_RATE;
  const jump = (WINDOW_SECONDS - 2 * STRIDE_SECONDS) * SAMPLE_RATE;
  if (sampleCount <= window) return 1;
  return 1 + Math.ceil((sampleCount - window) / jump);
}

/** Wall-clock span of segment `index` within a waveform of `sampleCount` samples, in seconds. */
export function segmentBounds(index: number, sampleCount: number): { start: number; end: number } {
  const start = index * SEGMENT_SECONDS;
  const end = Math.min((index + 1) * SEGMENT_SAMPLES, sampleCount) / SAMPLE_RATE;
  return { start, end: Math.max(start, end) };
}

/** Shifts chunk timestamps by `offsetSeconds` (segment-relative → file-relative). */
export function offsetChunks(chunks: TranscriptChunk[], offsetSeconds: number): TranscriptChunk[] {
  return chunks.map((chunk) => {
    const [chunkStart, chunkEnd] = chunk.timestamp;
    return {
      text: chunk.text,
      timestamp: [(chunkStart ?? 0) + offsetSeconds, chunkEnd == null ? null : chunkEnd + offsetSeconds],
    };
  });
}

/** Joins non-empty transcript pieces with single spaces. */
export function joinTranscriptText(parts: string[]): string {
  return parts
    .map((part) => part.trim())
    .filter(Boolean)
    .join(' ');
}

// Below this RMS a 30s window is treated as silence: detecting a language on it is noise.
const SPEECH_RMS_THRESHOLD = 0.005;

/**
 * Picks up to `maxWindows` 30s windows to run language detection on: the loudest ones by RMS,
 * returned in time order. Loudness is a cheap stand-in for "contains speech" — a recording that
 * opens on silence or hold music would otherwise make detection guess from nothing.
 * Returns sample offsets; an empty result means the audio is effectively silent.
 */
export function pickLanguageDetectionWindows(audio: Float32Array, maxWindows = 3): number[] {
  const window = WINDOW_SECONDS * SAMPLE_RATE;
  const candidates: Array<{ start: number; rms: number }> = [];

  for (let start = 0; start < audio.length; start += window) {
    const end = Math.min(start + window, audio.length);
    let sumSquares = 0;
    for (let i = start; i < end; i++) sumSquares += audio[i] * audio[i];
    const rms = Math.sqrt(sumSquares / Math.max(1, end - start));
    if (rms >= SPEECH_RMS_THRESHOLD) candidates.push({ start, rms });
  }

  return candidates
    .sort((a, b) => b.rms - a.rms)
    .slice(0, maxWindows)
    .map((candidate) => candidate.start)
    .sort((a, b) => a - b);
}

/** Thrown from inside generation when a segment exceeds its token budget. */
export class RunawayGenerationError extends Error {
  constructor(tokens: number, budget: number) {
    super(`Whisper generated ${tokens} tokens for one segment (budget ${budget}); skipping it.`);
    this.name = 'RunawayGenerationError';
  }
}

export interface SegmentStreamerCallbacks {
  /** Called after every generated token (not for the prompt). */
  onToken?: () => void;
  /** Called when one 30s window finishes generating. */
  onWindowEnd?: (windowsDone: number) => void;
}

/**
 * A transformers.js-compatible streamer (duck-typed `put`/`end`) that observes generation of one
 * segment. It is the worker's in-band loop guard: generation calls `put` between decoder steps,
 * so throwing from it aborts a runaway decode that never returns on its own. `put` receives the
 * prompt tokens first on every `generate` call; only later calls are generated tokens.
 */
export class SegmentStreamer {
  private tokens = 0;
  private windowsDone = 0;
  private awaitingPrompt = true;

  constructor(
    private readonly tokenBudget: number,
    private readonly callbacks: SegmentStreamerCallbacks = {}
  ) {}

  put(value: bigint[][]): void {
    if (this.awaitingPrompt) {
      this.awaitingPrompt = false;
      return;
    }
    // Greedy decoding pushes one [[token]] per step; count defensively in case a step carries more.
    this.tokens += value[0]?.length ?? 1;
    if (this.tokens > this.tokenBudget) {
      throw new RunawayGenerationError(this.tokens, this.tokenBudget);
    }
    this.callbacks.onToken?.();
  }

  end(): void {
    this.awaitingPrompt = true;
    this.windowsDone += 1;
    this.callbacks.onWindowEnd?.(this.windowsDone);
  }
}

/** Token budget for one segment: every window may use its full cap, plus prompt slack. */
export function segmentTokenBudget(sampleCount: number): number {
  return windowsPerSegment(sampleCount) * (MAX_NEW_TOKENS_PER_WINDOW + 8);
}
