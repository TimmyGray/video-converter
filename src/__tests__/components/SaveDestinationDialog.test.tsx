import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import SaveDestinationDialog from '@/components/SaveDestinationDialog';

interface WindowWithSavePicker extends Window {
  showSaveFilePicker?: jest.Mock;
}

const originalFetch = global.fetch;

const baseProps = {
  open: true,
  onClose: jest.fn(),
  outputUrl: 'blob:converted',
  outputFileName: 'demo_audio.mp3',
  outputFormat: 'mp3' as const,
  outputSizeBytes: 1024,
  conversionDurationMs: 1250,
  ffmpegMode: 'multithreaded' as const,
  performanceNote: null,
};

describe('SaveDestinationDialog', () => {
  beforeEach(() => {
    jest.clearAllMocks();

    Object.defineProperty(window, 'isSecureContext', {
      value: true,
      configurable: true,
    });

    const windowWithPicker = window as WindowWithSavePicker;
    windowWithPicker.showSaveFilePicker = jest.fn();

    Object.defineProperty(global, 'fetch', {
      configurable: true,
      value: jest.fn().mockResolvedValue({
        blob: async () => new Blob(['mp3-data'], { type: 'audio/mpeg' }),
      }),
    });
  });

  afterEach(() => {
    const windowWithPicker = window as WindowWithSavePicker;
    windowWithPicker.showSaveFilePicker = undefined;

    Object.defineProperty(global, 'fetch', {
      configurable: true,
      value: originalFetch,
    });
  });

  it('shows the generated output file name by default', () => {
    render(<SaveDestinationDialog {...baseProps} />);

    expect(screen.getByLabelText(/output file name/i)).toHaveValue('demo_audio.mp3');
  });

  it('uses generated output file name as suggested name for destination picker', async () => {
    const write = jest.fn().mockResolvedValue(undefined);
    const close = jest.fn().mockResolvedValue(undefined);
    const createWritable = jest.fn().mockResolvedValue({ write, close });

    const windowWithPicker = window as WindowWithSavePicker;
    windowWithPicker.showSaveFilePicker = jest.fn().mockResolvedValue({
      createWritable,
    });

    const onClose = jest.fn();

    render(<SaveDestinationDialog {...baseProps} onClose={onClose} />);

    fireEvent.click(screen.getByRole('button', { name: /choose destination/i }));

    await waitFor(() => {
      expect(windowWithPicker.showSaveFilePicker).toHaveBeenCalled();
    });

    expect(windowWithPicker.showSaveFilePicker).toHaveBeenCalledWith(
      expect.objectContaining({
        suggestedName: 'demo_audio.mp3',
      })
    );

    expect(createWritable).toHaveBeenCalledWith({ keepExistingData: false });
    expect(write).toHaveBeenCalledTimes(1);
    expect(close).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('uses the generated output file name for Browser Download', () => {
    const clickSpy = jest
      .spyOn(HTMLAnchorElement.prototype, 'click')
      .mockImplementation(function thisClick(this: HTMLAnchorElement) {
        expect(this.download).toBe('demo_audio.mp3');
      });

    const onClose = jest.fn();
    render(<SaveDestinationDialog {...baseProps} onClose={onClose} />);

    fireEvent.click(screen.getByRole('button', { name: /browser download/i }));

    expect(clickSpy).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
