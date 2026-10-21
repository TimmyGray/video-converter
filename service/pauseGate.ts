export interface PauseGate {
  readonly paused: boolean;
  pause: () => void;
  resume: () => void;
  /** Resolves at once when not paused; otherwise on resume, or rejects with an AbortError. */
  waitIfPaused: (signal?: AbortSignal) => Promise<void>;
  onChange: (listener: (paused: boolean) => void) => () => void;
}

export function createPauseGate(): PauseGate {
  let paused = false;
  const listeners = new Set<(paused: boolean) => void>();
  const waiters = new Set<() => void>();

  const set = (next: boolean) => {
    if (paused === next) return;
    paused = next;
    listeners.forEach((listener) => listener(next));
    if (!next) [...waiters].forEach((release) => release());
  };

  return {
    get paused() {
      return paused;
    },
    pause: () => set(true),
    resume: () => set(false),
    waitIfPaused: (signal) =>
      new Promise<void>((resolve, reject) => {
        if (!paused) return resolve();
        if (signal?.aborted) return reject(new DOMException('Stopped while paused.', 'AbortError'));

        const release = () => {
          waiters.delete(release);
          signal?.removeEventListener('abort', onAbort);
          resolve();
        };
        const onAbort = () => {
          waiters.delete(release);
          reject(new DOMException('Stopped while paused.', 'AbortError'));
        };
        waiters.add(release);
        signal?.addEventListener('abort', onAbort, { once: true });
      }),
    onChange: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}
