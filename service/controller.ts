import { POLL_INTERVAL_MS } from './config';
import { createPauseGate, type PauseGate } from './pauseGate';
import type { FileIdentity, Ledger, LedgerEntry } from './ledger';
import type { Stage } from './pipeline';
import { classifyScan, type StabilityTracker } from './scanner';
import type { PipelineCallbacks, TranscriptResult } from './pipeline';

export type ControllerState = 'watching' | 'paused' | 'processing' | 'stopping';
export type LogKind = 'info' | 'warn' | 'error' | 'done';

export interface LogLine {
  at: number;
  kind: LogKind;
  message: string;
}

export interface CurrentJob {
  name: string;
  path: string;
  size: number;
  stage: Stage;
  percent: number;
  startedAt: number;
  paused: boolean;
  /** Total time spent paused, excluding the current pause. */
  pausedMs: number;
  pausedSince: number | null;
}

export interface Snapshot {
  state: ControllerState;
  watching: boolean;
  current: CurrentJob | null;
  counts: { waiting: number; ignored: number; done: number; failed: number; cancelled: number };
  log: LogLine[];
}

export interface ControllerDeps {
  ledger: Ledger;
  tracker: StabilityTracker;
  listVideos: () => Promise<FileIdentity[]>;
  transcribe: (file: string, callbacks: PipelineCallbacks) => Promise<TranscriptResult>;
  saveTranscript: (videoPath: string, text: string) => Promise<string>;
  now: () => number;
  pollIntervalMs?: number;
}

const MAX_LOG_LINES = 100;

const basename = (file: string) => file.split(/[\\/]/).pop() ?? file;

const formatDuration = (ms: number) => {
  const total = Math.round(ms / 1000);
  const minutes = Math.floor(total / 60);
  return minutes > 0 ? `${minutes}m${String(total % 60).padStart(2, '0')}s` : `${total}s`;
};

export function createController(deps: ControllerDeps) {
  const pollIntervalMs = deps.pollIntervalMs ?? POLL_INTERVAL_MS;
  const listeners = new Set<() => void>();
  const log: LogLine[] = [];
  const reportedIgnored = new Set<string>();

  let watchEnabled = true;
  let stopping = false;
  let current: CurrentJob | null = null;
  let abort: AbortController | null = null;
  let gate: PauseGate | null = null;
  let cancelRequested = false;
  let wake: (() => void) | null = null;
  let waiting = 0;
  let ignored = 0;

  const emit = () => listeners.forEach((listener) => listener());

  const addLog = (kind: LogKind, message: string) => {
    log.push({ at: deps.now(), kind, message });
    if (log.length > MAX_LOG_LINES) log.shift();
    emit();
  };

  const snapshot = (): Snapshot => ({
    state: stopping ? 'stopping' : current ? 'processing' : watchEnabled ? 'watching' : 'paused',
    watching: watchEnabled,
    current: current ? { ...current } : null,
    counts: { waiting, ignored, ...deps.ledger.counts() },
    log: [...log],
  });

  const sleepUntilWoken = (ms: number | null) =>
    new Promise<void>((resolve) => {
      const timer = ms == null ? undefined : setTimeout(done, ms);
      function done() {
        clearTimeout(timer);
        wake = null;
        resolve();
      }
      wake = done;
    });

  const record = (entry: Omit<LedgerEntry, 'at'>) => {
    try {
      deps.ledger.record({ ...entry, at: new Date(deps.now()).toISOString() });
    } catch (err) {
      addLog('error', `Cannot write the state file, stopping so files are not reprocessed: ${(err as Error).message}`);
      stopping = true;
    }
  };

  const processFile = async (file: FileIdentity) => {
    const name = basename(file.path);
    const startedAt = deps.now();
    const job = new AbortController();
    abort = job;
    gate = createPauseGate();
    cancelRequested = false;
    current = {
      name,
      path: file.path,
      size: file.size,
      stage: 'extracting',
      percent: 0,
      startedAt,
      paused: false,
      pausedMs: 0,
      pausedSince: null,
    };
    addLog('info', `Started ${name}`);

    const base = { path: file.path, size: file.size, mtimeMs: file.mtimeMs };
    try {
      const result = await deps.transcribe(file.path, {
        signal: job.signal,
        gate,
        onStage: (stage) => {
          if (current) current.stage = stage;
          emit();
        },
        onProgress: (percent) => {
          if (current) current.percent = Math.max(current.percent, percent);
          emit();
        },
        onLog: (level, message) => addLog(level, message),
      });

      if (!result.text.trim()) {
        record({ ...base, status: 'done', output: null });
        addLog('warn', `${name}: no speech found, no transcript written`);
      } else {
        const output = await deps.saveTranscript(file.path, result.text);
        record({ ...base, status: 'done', output });
        addLog('done', `${name} -> ${basename(output)} (${formatDuration(deps.now() - startedAt)})`);
      }
    } catch (err) {
      if (job.signal.aborted) {
        if (cancelRequested) {
          record({ ...base, status: 'cancelled', output: null });
          addLog('warn', `${name}: cancelled, it will not be processed again`);
        } else {
          addLog('warn', `${name}: interrupted, it will be retried on the next start`);
        }
      } else {
        const message = err instanceof Error ? err.message : String(err);
        record({ ...base, status: 'failed', output: null, error: message });
        addLog('error', `${name}: ${message}`);
      }
    } finally {
      current = null;
      abort = null;
      gate = null;
    }
  };

  const run = async () => {
    addLog('info', 'Watching for new videos');
    while (!stopping) {
      if (!watchEnabled) {
        await sleepUntilWoken(null);
        continue;
      }

      let scan: ReturnType<typeof classifyScan>;
      try {
        scan = classifyScan(await deps.listVideos(), deps.ledger, deps.tracker, deps.now());
      } catch (err) {
        addLog('error', `Cannot scan the watch folder: ${(err as Error).message}`);
        await sleepUntilWoken(pollIntervalMs);
        continue;
      }

      waiting = scan.waiting;
      ignored = scan.ignored.length;
      for (const skipped of scan.ignored) {
        const key = `${skipped.path}\0${skipped.size}`;
        if (reportedIgnored.has(key)) continue;
        reportedIgnored.add(key);
        addLog('info', `Ignored ${basename(skipped.path)}: size is outside the 5 MB – 1 GB range`);
      }
      emit();

      if (scan.next) {
        await processFile(scan.next);
        continue;
      }
      await sleepUntilWoken(pollIntervalMs);
    }
  };

  const controller = {
    run,
    snapshot,
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    cancelCurrent: () => {
      if (!abort) return;
      cancelRequested = true;
      abort.abort();
    },
    pauseProcessing: () => {
      if (!current || !gate || current.paused) return;
      gate.pause();
      current.paused = true;
      current.pausedSince = deps.now();
      addLog('info', `Paused ${current.name}`);
    },
    resumeProcessing: () => {
      if (!current || !gate || !current.paused) return;
      current.pausedMs += deps.now() - (current.pausedSince ?? deps.now());
      current.paused = false;
      current.pausedSince = null;
      gate.resume();
      addLog('info', `Resumed ${current.name}`);
    },
    pause: () => {
      if (!watchEnabled) return;
      watchEnabled = false;
      addLog('info', current ? 'Watching paused after the current file' : 'Watching paused');
    },
    start: () => {
      if (watchEnabled) return;
      watchEnabled = true;
      addLog('info', 'Watching started');
      wake?.();
    },
    quit: () => {
      stopping = true;
      abort?.abort();
      wake?.();
      emit();
    },
    toggleProcessing: () => {
      if (current?.paused) controller.resumeProcessing();
      else controller.pauseProcessing();
    },
  };
  return controller;
}

export type Controller = ReturnType<typeof createController>;
