/** @jest-environment node */
import { createController, type Controller } from '../../../service/controller';
import type { FileIdentity, Ledger, LedgerEntry } from '../../../service/ledger';
import type { PipelineCallbacks, TranscriptResult } from '../../../service/pipeline';

const MIB = 1024 * 1024;
const file = (name: string, mtimeMs: number): FileIdentity => ({ path: `/in/${name}`, size: 6 * MIB, mtimeMs });

function memoryLedger() {
  const entries: LedgerEntry[] = [];
  const ledger: Ledger = {
    isProcessed: (id) => entries.some((e) => e.path === id.path && e.size === id.size && e.mtimeMs === id.mtimeMs),
    record: (entry) => {
      entries.push(entry);
    },
    counts: () => ({
      done: entries.filter((e) => e.status === 'done').length,
      failed: entries.filter((e) => e.status === 'failed').length,
      cancelled: entries.filter((e) => e.status === 'cancelled').length,
    }),
  };
  return { ledger, entries };
}

interface Job {
  file: string;
  callbacks: PipelineCallbacks;
  resolve: (result: TranscriptResult) => void;
  reject: (error: unknown) => void;
}

function setup(initial: FileIdentity[]) {
  const { ledger, entries } = memoryLedger();
  let files = initial;
  const jobs: Job[] = [];
  const saved: Array<{ video: string; text: string }> = [];
  const listVideos = jest.fn(async () => files);
  const controller: Controller = createController({
    ledger,
    tracker: { stable: (list) => list },
    listVideos,
    transcribe: (path, callbacks) =>
      new Promise<TranscriptResult>((resolve, reject) => {
        jobs.push({ file: path, callbacks, resolve, reject });
        callbacks.signal.addEventListener('abort', () => reject(new DOMException('stopped', 'AbortError')));
      }),
    saveTranscript: async (video, text) => {
      saved.push({ video, text });
      return video.replace('/in/', '/out/').replace(/\.\w+$/, '.txt');
    },
    now: Date.now,
    pollIntervalMs: 5,
  });
  return { controller, entries, jobs, saved, listVideos, setFiles: (next: FileIdentity[]) => (files = next) };
}

const until = async (condition: () => boolean) => {
  for (let i = 0; i < 400; i++) {
    if (condition()) return;
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  throw new Error('condition not met in time');
};
const result = (text: string): TranscriptResult => ({ text, chunks: [] });

describe('controller', () => {
  it('processes the oldest file first, one at a time, and does not scan while processing', async () => {
    const t = setup([file('new.mp4', 200), file('old.mp4', 100)]);
    const running = t.controller.run();

    await until(() => t.jobs.length === 1);
    expect(t.jobs[0].file).toBe('/in/old.mp4');
    expect(t.controller.snapshot().state).toBe('processing');

    const scansBefore = t.listVideos.mock.calls.length;
    await new Promise((resolve) => setTimeout(resolve, 60));
    expect(t.listVideos.mock.calls.length).toBe(scansBefore);
    expect(t.jobs).toHaveLength(1);

    t.jobs[0].resolve(result('hello'));
    await until(() => t.jobs.length === 2);
    expect(t.jobs[1].file).toBe('/in/new.mp4');
    expect(t.saved).toEqual([{ video: '/in/old.mp4', text: 'hello' }]);
    expect(t.entries[0]).toMatchObject({ path: '/in/old.mp4', status: 'done', output: '/out/old.txt' });

    t.controller.quit();
    await running;
  });

  it('rescans right after a file finishes and picks up files that arrived meanwhile', async () => {
    const t = setup([file('a.mp4', 1)]);
    const running = t.controller.run();
    await until(() => t.jobs.length === 1);

    t.setFiles([file('a.mp4', 1), file('b.mp4', 2)]);
    t.jobs[0].resolve(result('a'));
    await until(() => t.jobs.length === 2);
    expect(t.jobs[1].file).toBe('/in/b.mp4');

    t.controller.quit();
    await running;
  });

  it('never processes a finished file again', async () => {
    const t = setup([file('a.mp4', 1)]);
    const running = t.controller.run();
    await until(() => t.jobs.length === 1);
    t.jobs[0].resolve(result('a'));
    await until(() => t.entries.length === 1);
    await new Promise((resolve) => setTimeout(resolve, 40));
    expect(t.jobs).toHaveLength(1);
    t.controller.quit();
    await running;
  });

  it('records a cancelled file and does not retry it', async () => {
    const t = setup([file('a.mp4', 1)]);
    const running = t.controller.run();
    await until(() => t.jobs.length === 1);
    t.controller.cancelCurrent();
    await until(() => t.entries.length === 1);
    expect(t.entries[0].status).toBe('cancelled');
    await new Promise((resolve) => setTimeout(resolve, 40));
    expect(t.jobs).toHaveLength(1);
    t.controller.quit();
    await running;
  });

  it('records nothing when the service quits mid-file so the file is retried on the next start', async () => {
    const t = setup([file('a.mp4', 1)]);
    const running = t.controller.run();
    await until(() => t.jobs.length === 1);
    t.controller.quit();
    await running;
    expect(t.entries).toEqual([]);
  });

  it('records a failed file with its error and does not retry it', async () => {
    const t = setup([file('a.mp4', 1)]);
    const running = t.controller.run();
    await until(() => t.jobs.length === 1);
    t.jobs[0].reject(new Error('ffmpeg failed (exit 1): no audio'));
    await until(() => t.entries.length === 1);
    expect(t.entries[0]).toMatchObject({ status: 'failed', error: 'ffmpeg failed (exit 1): no audio' });
    expect(t.controller.snapshot().log.some((line) => line.kind === 'error')).toBe(true);
    await new Promise((resolve) => setTimeout(resolve, 40));
    expect(t.jobs).toHaveLength(1);
    t.controller.quit();
    await running;
  });

  it('marks a silent video done without writing a transcript', async () => {
    const t = setup([file('a.mp4', 1)]);
    const running = t.controller.run();
    await until(() => t.jobs.length === 1);
    t.jobs[0].resolve(result('   '));
    await until(() => t.entries.length === 1);
    expect(t.entries[0]).toMatchObject({ status: 'done', output: null });
    expect(t.saved).toEqual([]);
    t.controller.quit();
    await running;
  });

  it('pauses after the current file and resumes with an immediate scan', async () => {
    const t = setup([file('a.mp4', 1), file('b.mp4', 2)]);
    const running = t.controller.run();
    await until(() => t.jobs.length === 1);

    t.controller.pause();
    expect(t.controller.snapshot().state).toBe('processing');
    t.jobs[0].resolve(result('a'));
    await until(() => t.controller.snapshot().state === 'paused');
    const scans = t.listVideos.mock.calls.length;
    await new Promise((resolve) => setTimeout(resolve, 40));
    expect(t.jobs).toHaveLength(1);
    expect(t.listVideos.mock.calls.length).toBe(scans);

    t.controller.start();
    await until(() => t.jobs.length === 2);
    expect(t.jobs[1].file).toBe('/in/b.mp4');

    t.controller.quit();
    await running;
  });

  it('reports stage and progress of the current file, never moving backwards', async () => {
    const t = setup([file('a.mp4', 1)]);
    const running = t.controller.run();
    await until(() => t.jobs.length === 1);
    t.jobs[0].callbacks.onStage('transcribing-hosted');
    t.jobs[0].callbacks.onProgress(40);
    t.jobs[0].callbacks.onProgress(15);
    expect(t.controller.snapshot().current).toMatchObject({ name: 'a.mp4', stage: 'transcribing-hosted', percent: 40 });
    t.controller.quit();
    await running;
  });

  it('pauses and resumes the current file through its gate and keeps the pause out of elapsed time', async () => {
    let clock = 1_000;
    const { ledger } = memoryLedger();
    const jobs: Job[] = [];
    const controller = createController({
      ledger,
      tracker: { stable: (list) => list },
      listVideos: async () => [file('a.mp4', 1)],
      transcribe: (path, callbacks) =>
        new Promise<TranscriptResult>((resolve, reject) => {
          jobs.push({ file: path, callbacks, resolve, reject });
          callbacks.signal.addEventListener('abort', () => reject(new DOMException('stopped', 'AbortError')));
        }),
      saveTranscript: async () => '/out/a.txt',
      now: () => clock,
      pollIntervalMs: 5,
    });
    const running = controller.run();
    await until(() => jobs.length === 1);
    const { gate } = jobs[0].callbacks;
    expect(gate.paused).toBe(false);

    controller.toggleProcessing();
    expect(gate.paused).toBe(true);
    expect(controller.snapshot().current).toMatchObject({ paused: true, pausedSince: 1_000 });

    clock = 61_000;
    controller.toggleProcessing();
    expect(gate.paused).toBe(false);
    expect(controller.snapshot().current).toMatchObject({ paused: false, pausedMs: 60_000, pausedSince: null });

    controller.quit();
    await running;
  });

  it('ignores pause and resume when nothing is processing', async () => {
    const t = setup([]);
    const running = t.controller.run();
    t.controller.pauseProcessing();
    t.controller.resumeProcessing();
    t.controller.toggleProcessing();
    expect(t.controller.snapshot().current).toBeNull();
    t.controller.quit();
    await running;
  });

  it('cancels a paused file and releases whoever waits on its gate', async () => {
    const t = setup([file('a.mp4', 1)]);
    const running = t.controller.run();
    await until(() => t.jobs.length === 1);
    const { gate, signal } = t.jobs[0].callbacks;
    t.controller.pauseProcessing();
    const waiting = gate.waitIfPaused(signal);
    t.controller.cancelCurrent();
    await expect(waiting).rejects.toMatchObject({ name: 'AbortError' });
    await until(() => t.entries.length === 1);
    expect(t.entries[0].status).toBe('cancelled');
    t.controller.quit();
    await running;
  });

  it('reports watching as paused while a file is still running', async () => {
    const t = setup([file('a.mp4', 1)]);
    const running = t.controller.run();
    await until(() => t.jobs.length === 1);
    t.controller.pause();
    expect(t.controller.snapshot()).toMatchObject({ state: 'processing', watching: false });
    t.controller.quit();
    await running;
  });

  it('logs an out-of-range file once', async () => {
    const t = setup([{ path: '/in/tiny.mp4', size: 3 * MIB, mtimeMs: 1 }]);
    const running = t.controller.run();
    await until(() => t.listVideos.mock.calls.length >= 3);
    const ignoredLogs = t.controller.snapshot().log.filter((line) => line.message.includes('tiny.mp4'));
    expect(ignoredLogs).toHaveLength(1);
    expect(t.controller.snapshot().counts.ignored).toBe(1);
    t.controller.quit();
    await running;
  });
});
