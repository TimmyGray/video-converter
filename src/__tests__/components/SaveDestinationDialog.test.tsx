import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import SaveDestinationDialog from '@/components/SaveDestinationDialog';
import { invoke } from '@tauri-apps/api/core';

jest.mock('@tauri-apps/api/core', () => ({
  invoke: jest.fn(),
}));

interface WindowWithSavePicker extends Window {
  showSaveFilePicker?: jest.Mock;
  __TAURI__?: unknown;
  __TAURI_INTERNALS__?: unknown;
}

const originalFetch = global.fetch;
const invokeMock = invoke as jest.Mock;

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
    windowWithPicker.__TAURI__ = undefined;
    windowWithPicker.__TAURI_INTERNALS__ = undefined;

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
    windowWithPicker.__TAURI__ = undefined;
    windowWithPicker.__TAURI_INTERNALS__ = undefined;

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

  it('keeps Choose Destination enabled in Tauri runtime without browser picker', () => {
    const windowWithPicker = window as WindowWithSavePicker;
    windowWithPicker.showSaveFilePicker = undefined;
    windowWithPicker.__TAURI_INTERNALS__ = {};

    render(<SaveDestinationDialog {...baseProps} />);

    expect(screen.getByRole('button', { name: /choose destination/i })).toBeEnabled();
  });

  it('enables Choose Destination when browser picker is unavailable but native server capability is available', async () => {
    const windowWithPicker = window as WindowWithSavePicker;
    windowWithPicker.showSaveFilePicker = undefined;

    (global.fetch as jest.Mock).mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url === '/api/native-save' && (!init || init.method === 'GET')) {
        return {
          ok: true,
          json: async () => ({ available: true }),
        };
      }

      return {
        blob: async () => new Blob(['mp3-data'], { type: 'audio/mpeg' }),
      };
    });

    render(<SaveDestinationDialog {...baseProps} />);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /choose destination/i })).toBeEnabled();
    });

    expect(screen.getByText(/desktop native save dialog is available through the local app server/i)).toBeInTheDocument();
  });

  it('disables Choose Destination and shows warning when all save paths are unavailable', async () => {
    const windowWithPicker = window as WindowWithSavePicker;
    windowWithPicker.showSaveFilePicker = undefined;

    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => ({ available: false, reason: 'Native save endpoint unavailable.' }),
    });

    render(<SaveDestinationDialog {...baseProps} />);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /choose destination/i })).toBeDisabled();
    });

    expect(await screen.findByText(/native save endpoint unavailable/i)).toBeInTheDocument();
  });

  it('uses Tauri native save path and closes on successful save', async () => {
    const windowWithPicker = window as WindowWithSavePicker;
    windowWithPicker.showSaveFilePicker = undefined;
    windowWithPicker.__TAURI__ = {};

    invokeMock.mockResolvedValue(true);

    const onClose = jest.fn();
    render(<SaveDestinationDialog {...baseProps} onClose={onClose} />);

    fireEvent.click(screen.getByRole('button', { name: /choose destination/i }));

    await waitFor(() => {
      expect(invokeMock).toHaveBeenCalledWith(
        'save_file_with_dialog',
        expect.objectContaining({
          fileName: 'demo_audio.mp3',
          dataBase64: expect.any(String),
        })
      );
    });

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('handles Tauri native save cancellation without crash', async () => {
    const windowWithPicker = window as WindowWithSavePicker;
    windowWithPicker.showSaveFilePicker = undefined;
    windowWithPicker.__TAURI__ = {};

    invokeMock.mockResolvedValue(false);

    const onClose = jest.fn();
    render(<SaveDestinationDialog {...baseProps} onClose={onClose} />);

    fireEvent.click(screen.getByRole('button', { name: /choose destination/i }));

    await waitFor(() => {
      expect(invokeMock).toHaveBeenCalled();
    });

    expect(onClose).not.toHaveBeenCalled();
    expect(screen.queryByRole('alert', { name: /error/i })).not.toBeInTheDocument();
  });

  it('uses native server fallback path when picker is unavailable', async () => {
    const windowWithPicker = window as WindowWithSavePicker;
    windowWithPicker.showSaveFilePicker = undefined;

    (global.fetch as jest.Mock).mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const method = init?.method ?? 'GET';

      if (url === '/api/native-save' && method === 'GET') {
        return {
          ok: true,
          json: async () => ({ available: true }),
        };
      }

      if (url === '/api/native-save' && method === 'POST') {
        return {
          json: async () => ({ saved: true }),
        };
      }

      return {
        blob: async () => new Blob(['mp3-data'], { type: 'audio/mpeg' }),
      };
    });

    const onClose = jest.fn();
    render(<SaveDestinationDialog {...baseProps} onClose={onClose} />);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /choose destination/i })).toBeEnabled();
    });

    fireEvent.click(screen.getByRole('button', { name: /choose destination/i }));

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith('/api/native-save', expect.objectContaining({ method: 'POST' }));
    });

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('handles native server fallback cancellation without crash', async () => {
    const windowWithPicker = window as WindowWithSavePicker;
    windowWithPicker.showSaveFilePicker = undefined;

    (global.fetch as jest.Mock).mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const method = init?.method ?? 'GET';

      if (url === '/api/native-save' && method === 'GET') {
        return {
          ok: true,
          json: async () => ({ available: true }),
        };
      }

      if (url === '/api/native-save' && method === 'POST') {
        return {
          json: async () => ({ saved: false, cancelled: true }),
        };
      }

      return {
        blob: async () => new Blob(['mp3-data'], { type: 'audio/mpeg' }),
      };
    });

    const onClose = jest.fn();
    render(<SaveDestinationDialog {...baseProps} onClose={onClose} />);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /choose destination/i })).toBeEnabled();
    });

    fireEvent.click(screen.getByRole('button', { name: /choose destination/i }));

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith('/api/native-save', expect.objectContaining({ method: 'POST' }));
    });

    expect(onClose).not.toHaveBeenCalled();
  });

  it('handles browser picker cancellation without crash', async () => {
    const windowWithPicker = window as WindowWithSavePicker;
    windowWithPicker.showSaveFilePicker = jest
      .fn()
      .mockRejectedValue(new DOMException('The user aborted a request.', 'AbortError'));

    const onClose = jest.fn();
    render(<SaveDestinationDialog {...baseProps} onClose={onClose} />);

    fireEvent.click(screen.getByRole('button', { name: /choose destination/i }));

    await waitFor(() => {
      expect(windowWithPicker.showSaveFilePicker).toHaveBeenCalled();
    });

    expect(onClose).not.toHaveBeenCalled();
  });

  it('surfaces actionable error when browser write permission is denied', async () => {
    const windowWithPicker = window as WindowWithSavePicker;
    windowWithPicker.showSaveFilePicker = jest.fn().mockResolvedValue({
      queryPermission: jest.fn().mockResolvedValue('denied'),
      createWritable: jest.fn(),
    });

    render(<SaveDestinationDialog {...baseProps} />);

    fireEvent.click(screen.getByRole('button', { name: /choose destination/i }));

    expect(
      await screen.findByText(/blocked writing to the selected destination/i)
    ).toBeInTheDocument();
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
