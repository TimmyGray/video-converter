import { fork, type ChildProcess } from 'node:child_process';
import path from 'node:path';
import { createLocalTranscriptionSession, type WorkerLike } from '@/utils/localTranscriptionSession';

type Listener = (event: never) => void;

/**
 * Exposes a forked engine process through the DOM Worker surface the session supervisor uses
 * (`{ data }` message events, `{ message }` error events, `terminate`).
 */
export function adaptEngineProcess(child: ChildProcess): WorkerLike {
  const handlers = new Map<string, Map<Listener, (...args: never[]) => void>>();
  let terminating = false;

  const dispatchError = (message: string) => {
    for (const handler of handlers.get('error')?.values() ?? []) handler({ message } as never);
  };

  child.on('exit', (code, signal) => {
    if (!terminating) dispatchError(`Transcription engine exited unexpectedly (${signal ?? `code ${code}`}).`);
  });

  const adapter = {
    addEventListener(type: string, listener: Listener) {
      const wrapped =
        type === 'message'
          ? (data: unknown) => listener({ data } as never)
          : (err: Error) => listener({ message: err.message } as never);
      const forType = handlers.get(type) ?? new Map();
      forType.set(listener, wrapped as (...args: never[]) => void);
      handlers.set(type, forType);
      child.on(type, wrapped as never);
    },
    removeEventListener(type: string, listener: Listener) {
      const wrapped = handlers.get(type)?.get(listener);
      if (!wrapped) return;
      child.off(type, wrapped as never);
      handlers.get(type)?.delete(listener);
    },
    postMessage(message: unknown) {
      child.send(message as never, (err) => {
        if (err) dispatchError(`Could not reach the transcription engine: ${err.message}`);
      });
    },
    terminate() {
      terminating = true;
      child.kill('SIGKILL');
    },
  };
  return adapter as unknown as WorkerLike;
}

export function createNodeWhisperSession() {
  return createLocalTranscriptionSession(() =>
    adaptEngineProcess(fork(path.join(__dirname, 'whisperNode.process.ts'), { serialization: 'advanced' }))
  );
}
