import {
  MAX_CONSECUTIVE_STALLS,
  createLocalTranscriptionSession,
  describeSkippedSegments,
  type LocalTranscribeOptions,
} from '@/utils/localTranscriptionSession';
import { SEGMENT_SAMPLES } from '@/utils/transcriptionSegments';
import type { TranscribeRequest, WorkerOutbound } from '@/workers/whisper.worker';

const STALL_MS = 1_000;
const LOAD_STALL_MS = 5_000;

// Distributive Omit so each WorkerOutbound variant keeps its own fields.
type Outbound = WorkerOutbound extends infer M ? (M extends WorkerOutbound ? Omit<M, 'id'> : never) : never;

class FakeWorker {
  readonly requests: TranscribeRequest[] = [];
  readonly terminate = jest.fn();
  private listeners: Record<string, Set<(event: unknown) => void>> = {};

  postMessage(request: TranscribeRequest) {
    this.requests.push(request);
  }

  addEventListener(type: string, listener: (event: unknown) => void) {
    (this.listeners[type] ??= new Set()).add(listener);
  }

  removeEventListener(type: string, listener: (event: unknown) => void) {
    this.listeners[type]?.delete(listener);
  }

  /** Delivers a message tagged with the latest request id. */
  emit(message: Outbound) {
    const id = this.requests.at(-1)!.id;
    for (const listener of [...(this.listeners.message ?? [])]) listener({ data: { ...message, id } });
  }
}

function setup() {
  const workers: FakeWorker[] = [];
  const session = createLocalTranscriptionSession(
    () => {
      const worker = new FakeWorker();
      workers.push(worker);
      return worker as unknown as Worker;
    },
    { stallTimeoutMs: STALL_MS, loadStallTimeoutMs: LOAD_STALL_MS }
  );
  return { session, workers };
}

const minutes = (n: number) => new Float32Array(n * SEGMENT_SAMPLES);
const baseOptions: LocalTranscribeOptions = { language: null, translate: false };

beforeEach(() => {
  jest.useFakeTimers();
  jest.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
  jest.useRealTimers();
  jest.restoreAllMocks();
});

describe('createLocalTranscriptionSession', () => {
  it('assembles per-segment results in order and reports whole-file progress', async () => {
    const { session, workers } = setup();
    const onPartialText = jest.fn();
    const onTranscribeProgress = jest.fn();
    const onLanguageDetected = jest.fn();

    const run = session.run(minutes(2), { ...baseOptions, onPartialText, onTranscribeProgress, onLanguageDetected });
    const worker = workers[0];
    expect(worker.requests[0]).toEqual(
      expect.objectContaining({ firstSegment: 0, language: null, numThreads: null })
    );

    worker.emit({ type: 'ready' });
    worker.emit({ type: 'language', language: 'ru' });
    worker.emit({ type: 'heartbeat', segment: 0, fraction: 0.5 });
    worker.emit({ type: 'segment', segment: 0, text: 'привет', chunks: [{ text: 'привет', timestamp: [0, 1] }] });
    worker.emit({ type: 'segment', segment: 1, text: 'мир', chunks: [{ text: 'мир', timestamp: [60, 61] }] });
    worker.emit({ type: 'done' });

    await expect(run).resolves.toEqual({
      text: 'привет мир',
      chunks: [
        { text: 'привет', timestamp: [0, 1] },
        { text: 'мир', timestamp: [60, 61] },
      ],
      language: 'ru',
      skippedSegments: [],
    });
    expect(onLanguageDetected).toHaveBeenCalledWith('ru');
    expect(onPartialText.mock.calls).toEqual([['привет'], ['привет мир']]);
    expect(onTranscribeProgress.mock.calls.map(([p]) => p)).toEqual([25, 50, 100]);
  });

  it('starts at startSegment and sends only the remainder of the audio', async () => {
    const { session, workers } = setup();
    const onTranscribeProgress = jest.fn();
    const run = session.run(minutes(3), { ...baseOptions, startSegment: 2, onTranscribeProgress });

    const request = workers[0].requests[0];
    expect(request.firstSegment).toBe(2);
    expect(request.audio.length).toBe(SEGMENT_SAMPLES);

    workers[0].emit({ type: 'ready' });
    workers[0].emit({ type: 'segment', segment: 2, text: 'tail', chunks: [] });
    workers[0].emit({ type: 'done' });
    await expect(run).resolves.toEqual(expect.objectContaining({ text: 'tail' }));
    expect(onTranscribeProgress).toHaveBeenLastCalledWith(100);
  });

  it('kills a hung worker, skips its segment and resumes on a fresh worker with the pinned language', async () => {
    const { session, workers } = setup();
    const onSegmentSkipped = jest.fn();
    const run = session.run(minutes(3), { ...baseOptions, onSegmentSkipped });

    workers[0].emit({ type: 'ready' });
    workers[0].emit({ type: 'language', language: 'ru' });
    workers[0].emit({ type: 'segment', segment: 0, text: 'one', chunks: [] });
    await jest.advanceTimersByTimeAsync(STALL_MS); // segment 1 hangs

    expect(workers[0].terminate).toHaveBeenCalled();
    expect(onSegmentSkipped).toHaveBeenCalledWith({ index: 1, startSeconds: 60, endSeconds: 120, reason: 'stalled' });
    expect(workers).toHaveLength(2);
    expect(workers[1].requests[0]).toEqual(
      expect.objectContaining({ firstSegment: 2, language: 'ru', numThreads: null })
    );
    expect(workers[1].requests[0].audio.length).toBe(SEGMENT_SAMPLES);

    workers[1].emit({ type: 'ready' });
    workers[1].emit({ type: 'segment', segment: 2, text: 'three', chunks: [] });
    workers[1].emit({ type: 'done' });

    const result = await run;
    expect(result.text).toBe('one three');
    expect(result.skippedSegments).toEqual([expect.objectContaining({ index: 1, reason: 'stalled' })]);
  });

  it('keeps a slow but alive engine running as long as heartbeats arrive', async () => {
    const { session, workers } = setup();
    const run = session.run(minutes(1), baseOptions);

    workers[0].emit({ type: 'ready' });
    for (let i = 0; i < 5; i++) {
      await jest.advanceTimersByTimeAsync(STALL_MS - 1);
      workers[0].emit({ type: 'heartbeat', segment: 0, fraction: 0 });
    }
    workers[0].emit({ type: 'segment', segment: 0, text: 'slow', chunks: [] });
    workers[0].emit({ type: 'done' });

    await expect(run).resolves.toEqual(expect.objectContaining({ text: 'slow', skippedSegments: [] }));
    expect(workers).toHaveLength(1);
  });

  it('does not count a deliberate pause as a stall and re-arms the watchdog on resume', async () => {
    const { session, workers } = setup();
    const run = session.run(minutes(2), baseOptions);
    workers[0].emit({ type: 'ready' });

    session.pause();
    await jest.advanceTimersByTimeAsync(STALL_MS * 10);
    expect(workers[0].terminate).not.toHaveBeenCalled();

    session.resume();
    workers[0].emit({ type: 'segment', segment: 0, text: 'one', chunks: [] });
    await jest.advanceTimersByTimeAsync(STALL_MS - 1);
    expect(workers[0].terminate).not.toHaveBeenCalled();

    workers[0].emit({ type: 'segment', segment: 1, text: 'two', chunks: [] });
    workers[0].emit({ type: 'done' });
    await expect(run).resolves.toEqual(expect.objectContaining({ text: 'one two', skippedSegments: [] }));
  });

  it('still detects a hang after resume', async () => {
    const { session, workers } = setup();
    const run = session.run(minutes(1), baseOptions);
    workers[0].emit({ type: 'ready' });
    session.pause();
    session.resume();
    await jest.advanceTimersByTimeAsync(STALL_MS);
    expect(workers[0].terminate).toHaveBeenCalled();
    const result = await run;
    expect(result.skippedSegments).toEqual([expect.objectContaining({ index: 0, reason: 'stalled' })]);
  });

  it('ignores messages arriving while paused without arming the watchdog', async () => {
    const { session, workers } = setup();
    const run = session.run(minutes(1), baseOptions);
    workers[0].emit({ type: 'ready' });
    session.pause();
    workers[0].emit({ type: 'heartbeat', segment: 0, fraction: 0.5 });
    await jest.advanceTimersByTimeAsync(STALL_MS * 5);
    expect(workers[0].terminate).not.toHaveBeenCalled();
    session.resume();
    workers[0].emit({ type: 'segment', segment: 0, text: 'x', chunks: [] });
    workers[0].emit({ type: 'done' });
    await run;
  });

  it('drops to a single ONNX thread after consecutive stalls and gives up after too many', async () => {
    const { session, workers } = setup();
    const run = session.run(minutes(10), baseOptions);
    const settled = run.catch((error: Error) => error);

    for (let i = 0; i < MAX_CONSECUTIVE_STALLS; i++) {
      workers[i].emit({ type: 'ready' });
      await jest.advanceTimersByTimeAsync(STALL_MS);
    }

    expect(workers[1].requests[0].numThreads).toBeNull();
    expect(workers[2].requests[0].numThreads).toBe(1);
    expect(await settled).toEqual(expect.objectContaining({ message: expect.stringMatching(/stalled on 4 segments/) }));
  });

  it('retries a hung model load once single-threaded, then fails', async () => {
    const { session, workers } = setup();
    const settled = session.run(minutes(1), baseOptions).catch((error: Error) => error);

    await jest.advanceTimersByTimeAsync(LOAD_STALL_MS);
    expect(workers).toHaveLength(2);
    expect(workers[1].requests[0].numThreads).toBe(1);

    await jest.advanceTimersByTimeAsync(LOAD_STALL_MS);
    expect(await settled).toEqual(expect.objectContaining({ message: expect.stringMatching(/starting up/) }));
  });

  it('reports runaway segments but stays quiet about routine decode errors', async () => {
    const { session, workers } = setup();
    const onSegmentSkipped = jest.fn();
    const run = session.run(minutes(2), { ...baseOptions, onSegmentSkipped });

    workers[0].emit({ type: 'ready' });
    workers[0].emit({ type: 'segment-skipped', segment: 0, reason: 'error', message: 'empty' });
    workers[0].emit({ type: 'segment-skipped', segment: 1, reason: 'runaway', message: 'loop' });
    workers[0].emit({ type: 'done' });

    await run;
    expect(onSegmentSkipped).toHaveBeenCalledTimes(1);
    expect(onSegmentSkipped).toHaveBeenCalledWith(expect.objectContaining({ index: 1, reason: 'runaway' }));
  });

  it('rejects with the worker error message', async () => {
    const { session, workers } = setup();
    const run = session.run(minutes(1), baseOptions);
    workers[0].emit({ type: 'error', message: 'no backend' });
    await expect(run).rejects.toThrow('no backend');
  });

  it('cancel rejects the run with an AbortError and kills the worker', async () => {
    const { session, workers } = setup();
    const run = session.run(minutes(1), baseOptions);
    session.cancel();
    await expect(run).rejects.toEqual(expect.objectContaining({ name: 'AbortError' }));
    expect(workers[0].terminate).toHaveBeenCalled();
  });

  it('reuses a warm worker across runs', async () => {
    const { session, workers } = setup();
    for (let i = 0; i < 2; i++) {
      const run = session.run(minutes(1), baseOptions);
      workers[0].emit({ type: 'ready' });
      workers[0].emit({ type: 'done' });
      await run;
    }
    expect(workers).toHaveLength(1);
  });
});

describe('describeSkippedSegments', () => {
  it('lists skipped ranges in time order', () => {
    expect(
      describeSkippedSegments([
        { index: 25, startSeconds: 1500, endSeconds: 1560, reason: 'runaway' },
        { index: 12, startSeconds: 720, endSeconds: 780, reason: 'stalled' },
      ])
    ).toBe('The on-device engine got stuck and skipped 12:00–13:00, 25:00–26:00. The rest was transcribed.');
  });
});
