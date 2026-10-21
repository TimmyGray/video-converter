/** @jest-environment node */
import type { ChildProcess } from 'node:child_process';
import { EventEmitter } from 'node:events';
import { adaptEngineProcess } from '../../../service/localEngine';

class FakeChild extends EventEmitter {
  sent: unknown[] = [];
  killedWith: string | null = null;
  sendError: Error | null = null;
  send(message: unknown, callback: (err: Error | null) => void) {
    this.sent.push(message);
    callback(this.sendError);
    return true;
  }
  kill(signal: string) {
    this.killedWith = signal;
    return true;
  }
}

const setup = () => {
  const fake = new FakeChild();
  return { fake, adapter: adaptEngineProcess(fake as unknown as ChildProcess) };
};

describe('adaptEngineProcess', () => {
  it('delivers engine messages as { data } events', () => {
    const { fake, adapter } = setup();
    const listener = jest.fn();
    adapter.addEventListener('message', listener);
    fake.emit('message', { type: 'ready', id: 1 });
    expect(listener).toHaveBeenCalledWith({ data: { type: 'ready', id: 1 } });
  });

  it('delivers process errors as { message } events', () => {
    const { fake, adapter } = setup();
    const listener = jest.fn();
    adapter.addEventListener('error', listener);
    fake.emit('error', new Error('boom'));
    expect(listener).toHaveBeenCalledWith({ message: 'boom' });
  });

  it('stops delivering after removeEventListener', () => {
    const { fake, adapter } = setup();
    const listener = jest.fn();
    adapter.addEventListener('message', listener);
    adapter.removeEventListener('message', listener);
    fake.emit('message', { type: 'done', id: 1 });
    expect(listener).not.toHaveBeenCalled();
  });

  it('sends requests over IPC and reports a failed send', () => {
    const { fake, adapter } = setup();
    const listener = jest.fn();
    adapter.addEventListener('error', listener);
    adapter.postMessage({ type: 'transcribe' });
    expect(fake.sent).toEqual([{ type: 'transcribe' }]);
    expect(listener).not.toHaveBeenCalled();

    fake.sendError = new Error('channel closed');
    adapter.postMessage({ type: 'transcribe' });
    expect(listener).toHaveBeenCalledWith({ message: 'Could not reach the transcription engine: channel closed' });
  });

  it('reports a crash as an error event', () => {
    const { fake, adapter } = setup();
    const listener = jest.fn();
    adapter.addEventListener('error', listener);
    fake.emit('exit', null, 'SIGSEGV');
    expect(listener).toHaveBeenCalledWith({ message: 'Transcription engine exited unexpectedly (SIGSEGV).' });
  });

  it('kills the process on terminate() and does not report that exit', () => {
    const { fake, adapter } = setup();
    const listener = jest.fn();
    adapter.addEventListener('error', listener);
    adapter.terminate();
    fake.emit('exit', null, 'SIGKILL');
    expect(fake.killedWith).toBe('SIGKILL');
    expect(listener).not.toHaveBeenCalled();
  });
});
