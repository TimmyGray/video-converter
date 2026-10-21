import type { TranscriptChunk } from '@/types';
import type { TranscribeRequest, WorkerOutbound } from '@/workers/whisper.worker';
import { formatClock } from '@/utils/formatUtils';
import { SEGMENT_SAMPLES, countSegments, joinTranscriptText, segmentBounds } from '@/utils/transcriptionSegments';

/**
 * Main-thread supervisor for the local Whisper worker.
 *
 * A worker blocked inside ONNX Runtime cannot time itself out — its thread is stuck in WASM — so
 * the watchdog lives here: every worker message re-arms a timer, and silence past the limit means
 * the engine hung. The supervisor then terminates the worker, records the segment as skipped and
 * restarts a fresh worker from the next segment (dropping to one ONNX thread after repeated
 * stalls, in case the hang is a threading bug). Pure TypeScript with an injected worker factory,
 * so the recovery logic is unit-tested without a browser.
 */

/** No message for this long while decoding = hung. A decoder step takes well under a second. */
export const STALL_TIMEOUT_MS = 3 * 60_000;
/** Model download emits steady progress, but session creation is silent and slow on WASM. */
export const LOAD_STALL_TIMEOUT_MS = 10 * 60_000;
/** After this many stalls in a row, restart workers with a single ONNX Runtime thread. */
export const SINGLE_THREAD_AFTER_STALLS = 2;
/** After this many stalls in a row, give up rather than skip the rest of the file minute by minute. */
export const MAX_CONSECUTIVE_STALLS = 4;
/** Load (pre-`ready`) stalls tolerated: one retry with a single thread, then fail. */
const MAX_LOAD_STALLS = 2;

export type WorkerLike = Pick<Worker, 'postMessage' | 'addEventListener' | 'removeEventListener' | 'terminate'>;

export interface SkippedSegment {
  index: number;
  startSeconds: number;
  endSeconds: number;
  /** `stalled`: the engine stopped responding; `runaway`: Whisper exceeded its token budget. */
  reason: 'stalled' | 'runaway';
}

export interface LocalTranscribeOptions {
  /** Whisper language name or code; null = detect from the audio. */
  language: string | null;
  translate: boolean;
  /** First 60s segment to transcribe — used to resume after the hosted engine gave up. */
  startSegment?: number;
  onModelProgress?: (percent: number) => void;
  /** Share of the WHOLE waveform covered so far (0–100), including segments before `startSegment`. */
  onTranscribeProgress?: (percent: number) => void;
  /** Accumulated text of this run (segments from `startSegment` on). */
  onPartialText?: (text: string) => void;
  onLanguageDetected?: (language: string) => void;
  onSegmentSkipped?: (segment: SkippedSegment) => void;
}

export interface LocalTranscriptResult {
  text: string;
  chunks: TranscriptChunk[];
  /** The language actually used — the caller's choice or the detected one. */
  language: string | null;
  skippedSegments: SkippedSegment[];
}

export interface LocalTranscriptionSession {
  run: (audio: Float32Array, options: LocalTranscribeOptions) => Promise<LocalTranscriptResult>;
  /** Stops the in-flight run (it rejects with an AbortError) and kills the worker. */
  cancel: () => void;
  /** Suspends the stall watchdog while the host has frozen the worker on purpose. */
  pause: () => void;
  resume: () => void;
  dispose: () => void;
}

export interface SessionTiming {
  stallTimeoutMs?: number;
  loadStallTimeoutMs?: number;
}

type PassOutcome = { kind: 'done' } | { kind: 'stalled'; ready: boolean };

export function createLocalTranscriptionSession(
  createWorker: () => WorkerLike,
  timing: SessionTiming = {}
): LocalTranscriptionSession {
  const stallTimeoutMs = timing.stallTimeoutMs ?? STALL_TIMEOUT_MS;
  const loadStallTimeoutMs = timing.loadStallTimeoutMs ?? LOAD_STALL_TIMEOUT_MS;

  let worker: WorkerLike | null = null;
  let workerThreads: number | null = null;
  let requestId = 0;
  let cancelPending: (() => void) | null = null;
  let paused = false;
  let watchdog: { arm: () => void; disarm: () => void } | null = null;

  const killWorker = () => {
    worker?.terminate();
    worker = null;
  };

  // The thread count is fixed when a worker's ONNX Runtime initializes, so a different count
  // needs a fresh worker. Keeping the worker otherwise keeps the loaded model warm across runs.
  const getWorker = (numThreads: number | null): WorkerLike => {
    if (worker && workerThreads !== numThreads) killWorker();
    if (!worker) {
      worker = createWorker();
      workerThreads = numThreads;
    }
    return worker;
  };

  const run = async (audio: Float32Array, options: LocalTranscribeOptions): Promise<LocalTranscriptResult> => {
    const totalSegments = countSegments(audio.length);
    let next = Math.min(Math.max(0, options.startSegment ?? 0), totalSegments);
    let language = options.language;
    const texts: string[] = [];
    const chunks: TranscriptChunk[] = [];
    const skippedSegments: SkippedSegment[] = [];
    let consecutiveStalls = 0;
    let loadStalls = 0;
    let singleThread = false;

    const reportProgress = (fraction: number) => {
      options.onTranscribeProgress?.(Math.round(((next + fraction) / totalSegments) * 100));
    };

    const skip = (index: number, reason: SkippedSegment['reason']) => {
      const { start, end } = segmentBounds(index, audio.length);
      const skipped: SkippedSegment = { index, startSeconds: start, endSeconds: end, reason };
      skippedSegments.push(skipped);
      options.onSegmentSkipped?.(skipped);
    };

    const pass = () =>
      new Promise<PassOutcome>((resolve, reject) => {
        const activeWorker = getWorker(singleThread ? 1 : null);
        const id = ++requestId;
        const fileProgress = new Map<string, number>();
        let ready = false;
        let timer: ReturnType<typeof setTimeout> | undefined;

        const cleanup = () => {
          clearTimeout(timer);
          activeWorker.removeEventListener('message', handleMessage);
          activeWorker.removeEventListener('error', handleError);
          cancelPending = null;
          watchdog = null;
        };

        const arm = () => {
          clearTimeout(timer);
          if (paused) return;
          timer = setTimeout(
            () => {
              cleanup();
              resolve({ kind: 'stalled', ready });
            },
            ready ? stallTimeoutMs : loadStallTimeoutMs
          );
        };

        cancelPending = () => {
          cleanup();
          reject(new DOMException('Transcription was stopped.', 'AbortError'));
        };

        function handleMessage(event: MessageEvent<WorkerOutbound>) {
          const message = event.data;
          if (!message || message.id !== id) return;

          switch (message.type) {
            case 'model-progress': {
              const { file, progress } = message.data;
              if (options.onModelProgress && file && typeof progress === 'number') {
                fileProgress.set(file, progress);
                const values = [...fileProgress.values()];
                const average = values.reduce((sum, value) => sum + value, 0) / values.length;
                options.onModelProgress(Math.round(average));
              }
              break;
            }
            case 'ready':
              ready = true;
              break;
            case 'language':
              // Pin it so a restarted worker does not pay for detection again (or pick differently).
              language = message.language;
              options.onLanguageDetected?.(message.language);
              break;
            case 'heartbeat':
              if (message.segment === next) reportProgress(message.fraction);
              break;
            case 'segment':
              next = message.segment + 1;
              consecutiveStalls = 0;
              chunks.push(...message.chunks);
              if (message.text) {
                texts.push(message.text);
                options.onPartialText?.(joinTranscriptText(texts));
              }
              reportProgress(0);
              break;
            case 'segment-skipped':
              next = message.segment + 1;
              consecutiveStalls = 0;
              // Decode errors on near-silence are routine and not worth a notice; a runaway is.
              if (message.reason === 'runaway') skip(message.segment, 'runaway');
              reportProgress(0);
              break;
            case 'done':
              cleanup();
              resolve({ kind: 'done' });
              return;
            case 'error':
              cleanup();
              reject(new Error(message.message));
              return;
            default:
              break;
          }
          arm();
        }

        function handleError(event: ErrorEvent) {
          cleanup();
          reject(new Error(event.message || 'Transcription worker failed to run.'));
        }

        activeWorker.addEventListener('message', handleMessage);
        activeWorker.addEventListener('error', handleError);
        watchdog = { arm, disarm: () => clearTimeout(timer) };
        arm();

        // Send only the remainder, as a transferred copy: a structured clone of a subarray would
        // copy the whole underlying buffer (an hour of audio is ~230 MB) on every restart.
        const remainder = audio.slice(next * SEGMENT_SAMPLES);
        const request: TranscribeRequest = {
          type: 'transcribe',
          id,
          audio: remainder,
          firstSegment: next,
          language,
          translate: options.translate,
          numThreads: singleThread ? 1 : null,
        };
        activeWorker.postMessage(request, [remainder.buffer]);
      });

    while (next < totalSegments) {
      const outcome = await pass();
      if (outcome.kind === 'done') break;

      killWorker();
      if (!outcome.ready) {
        loadStalls += 1;
        if (loadStalls >= MAX_LOAD_STALLS) {
          throw new Error('The on-device speech engine stopped responding while starting up.');
        }
        singleThread = true;
        continue;
      }

      console.warn(`[localTranscription] engine stalled on segment ${next + 1}; restarting from the next one.`);
      skip(next, 'stalled');
      next += 1;
      consecutiveStalls += 1;
      reportProgress(0);
      if (consecutiveStalls >= MAX_CONSECUTIVE_STALLS) {
        throw new Error(
          `The on-device speech engine stalled on ${consecutiveStalls} segments in a row. ` +
            'Try a different browser or turn on hardware acceleration.'
        );
      }
      if (consecutiveStalls >= SINGLE_THREAD_AFTER_STALLS) singleThread = true;
    }

    return { text: joinTranscriptText(texts), chunks, language, skippedSegments };
  };

  const cancel = () => {
    paused = false;
    cancelPending?.();
    killWorker();
  };

  const pause = () => {
    paused = true;
    watchdog?.disarm();
  };

  const resume = () => {
    paused = false;
    watchdog?.arm();
  };

  return { run, cancel, pause, resume, dispose: cancel };
}

/**
 * One user-facing sentence listing the stretches the local engine skipped, e.g.
 * "The on-device engine got stuck and skipped 12:00–13:00, 25:00–26:00. The rest was transcribed."
 */
export function describeSkippedSegments(segments: SkippedSegment[]): string {
  const ranges = [...segments]
    .sort((a, b) => a.index - b.index)
    .map((segment) => `${formatClock(segment.startSeconds)}–${formatClock(segment.endSeconds)}`)
    .join(', ');
  return `The on-device engine got stuck and skipped ${ranges}. The rest was transcribed.`;
}
