import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import TrimTimeline, { moveHandle } from '@/components/TrimTimeline';

const DURATION = 100;

class FakeVideo {
  preload = '';
  duration = DURATION;
  private listeners: Record<string, Array<() => void>> = {};
  addEventListener(type: string, cb: () => void) {
    (this.listeners[type] ??= []).push(cb);
  }
  removeEventListener(type: string, cb: () => void) {
    this.listeners[type] = (this.listeners[type] ?? []).filter((fn) => fn !== cb);
  }
  removeAttribute() {}
  load() {}
  set src(_value: string) {
    queueMicrotask(() => (this.listeners.loadedmetadata ?? []).forEach((cb) => cb()));
  }
}

const file = new File(['x'], 'clip.mp4', { type: 'video/mp4' });

beforeEach(() => {
  URL.createObjectURL = jest.fn(() => 'blob:fake');
  URL.revokeObjectURL = jest.fn();
  const realCreate = document.createElement.bind(document);
  jest.spyOn(document, 'createElement').mockImplementation(((tag: string) =>
    tag === 'video' ? (new FakeVideo() as unknown as HTMLElement) : realCreate(tag)) as typeof document.createElement);
});

afterEach(() => jest.restoreAllMocks());

async function renderTimeline(props: Partial<React.ComponentProps<typeof TrimTimeline>> = {}) {
  const onApply = jest.fn();
  await act(async () => {
    render(<TrimTimeline file={file} appliedRange={null} onApply={onApply} {...props} />);
  });
  return onApply;
}

describe('moveHandle', () => {
  const range = { start: 20, end: 60 };

  it('clamps inside the media duration', () => {
    expect(moveHandle(range, 'start', -5, DURATION).start).toBe(0);
    expect(moveHandle(range, 'end', 500, DURATION).end).toBe(DURATION);
  });

  it('never lets the handles cross and keeps a minimum gap', () => {
    expect(moveHandle(range, 'start', 90, DURATION).start).toBe(59.5);
    expect(moveHandle(range, 'end', 0, DURATION).end).toBe(20.5);
  });
});

describe('TrimTimeline', () => {
  it('renders nothing until a file is selected', async () => {
    await act(async () => {
      render(<TrimTimeline file={null} appliedRange={null} onApply={jest.fn()} />);
    });
    expect(screen.queryByTestId('trim-timeline')).toBeNull();
  });

  it('starts on the full range with Cut disabled', async () => {
    await renderTimeline();
    expect(screen.getByTestId('trim-start-label')).toHaveTextContent('Start 0:00.0');
    expect(screen.getByTestId('trim-end-label')).toHaveTextContent('End 1:40.0');
    expect(screen.getByTestId('trim-cut-button')).toBeDisabled();
  });

  it('moves handles with the keyboard and applies the range on Cut', async () => {
    const onApply = await renderTimeline();

    fireEvent.keyDown(screen.getByTestId('trim-handle-start'), { key: 'ArrowRight', shiftKey: true });
    fireEvent.keyDown(screen.getByTestId('trim-handle-end'), { key: 'ArrowLeft', shiftKey: true });

    expect(screen.getByTestId('trim-start-label')).toHaveTextContent('Start 0:05.0');
    expect(screen.getByTestId('trim-end-label')).toHaveTextContent('End 1:35.0');

    fireEvent.click(screen.getByTestId('trim-cut-button'));
    expect(onApply).toHaveBeenCalledWith({ start: 5, end: 95 });
  });

  it('shows the applied cut and Reset clears it', async () => {
    const onApply = await renderTimeline({ appliedRange: { start: 10, end: 40 } });

    expect(screen.getByTestId('trim-applied-chip')).toHaveTextContent('0:10.0 – 0:40.0');
    expect(screen.getByTestId('trim-cut-button')).toBeDisabled();

    fireEvent.click(screen.getByTestId('trim-reset-button'));
    expect(onApply).toHaveBeenCalledWith(null);
  });

  it('ignores interaction while disabled', async () => {
    await renderTimeline({ disabled: true });

    fireEvent.keyDown(screen.getByTestId('trim-handle-start'), { key: 'ArrowRight' });

    expect(screen.getByTestId('trim-start-label')).toHaveTextContent('Start 0:00.0');
    expect(screen.getByTestId('trim-cut-button')).toBeDisabled();
  });
});
