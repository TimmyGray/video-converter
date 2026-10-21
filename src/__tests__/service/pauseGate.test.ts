/** @jest-environment node */
import { createPauseGate } from '../../../service/pauseGate';

describe('createPauseGate', () => {
  it('lets callers through immediately while not paused', async () => {
    await expect(createPauseGate().waitIfPaused()).resolves.toBeUndefined();
  });

  it('holds waiters until resume', async () => {
    const gate = createPauseGate();
    gate.pause();
    let released = false;
    const waiting = gate.waitIfPaused().then(() => {
      released = true;
    });
    await Promise.resolve();
    expect(released).toBe(false);
    gate.resume();
    await waiting;
    expect(released).toBe(true);
  });

  it('rejects a waiter with an AbortError when the signal aborts, and an already aborted one at once', async () => {
    const gate = createPauseGate();
    gate.pause();
    const controller = new AbortController();
    const waiting = gate.waitIfPaused(controller.signal);
    controller.abort();
    await expect(waiting).rejects.toMatchObject({ name: 'AbortError' });
    await expect(gate.waitIfPaused(AbortSignal.abort())).rejects.toMatchObject({ name: 'AbortError' });
  });

  it('notifies listeners only on real changes and stops after unsubscribe', () => {
    const gate = createPauseGate();
    const listener = jest.fn();
    const off = gate.onChange(listener);
    gate.pause();
    gate.pause();
    gate.resume();
    expect(listener.mock.calls).toEqual([[true], [false]]);
    off();
    gate.pause();
    expect(listener).toHaveBeenCalledTimes(2);
    expect(gate.paused).toBe(true);
  });
});
