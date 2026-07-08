import { renderHook, act } from '@testing-library/react';
import { useFileConverter } from '@/hooks/useFileConverter';

const mockLoadFFmpeg = jest.fn().mockResolvedValue(undefined);
const mockTranscode = jest.fn().mockResolvedValue({
  url: 'blob:mock',
  fileName: 'output.mp4',
  sizeBytes: 2048,
  ffmpegMode: 'multithreaded',
  performanceNote: null,
});

jest.mock('@/hooks/useFFmpeg', () => ({
  useFFmpeg: () => ({
    isLoaded: false,
    isLoading: false,
    loadError: null,
    ffmpegMode: 'multithreaded',
    loadFFmpeg: mockLoadFFmpeg,
    transcode: mockTranscode,
  }),
}));

describe('useFileConverter', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('initialises with default state', () => {
    const { result } = renderHook(() => useFileConverter());
    expect(result.current.job.file).toBeNull();
    expect(result.current.job.status).toBe('idle');
    expect(result.current.job.conversionMode).toBe('video');
    expect(result.current.job.outputFormat).toBe('mp4');
    expect(result.current.job.cropSettings.mode).toBe('none');
    expect(result.current.job.progress).toBe(0);
    expect(result.current.job.outputSizeBytes).toBeNull();
    expect(result.current.job.conversionDurationMs).toBeNull();
  });

  it('selectFile updates file', () => {
    const { result } = renderHook(() => useFileConverter());
    const file = new File([''], 'test.mp4', { type: 'video/mp4' });
    act(() => result.current.selectFile(file));
    expect(result.current.job.file).toBe(file);
  });

  it('selectFormat updates outputFormat', () => {
    const { result } = renderHook(() => useFileConverter());
    act(() => result.current.selectFormat('webm'));
    expect(result.current.job.outputFormat).toBe('webm');
  });

  it('switching to audio extraction mode forces MP3 output', () => {
    const { result } = renderHook(() => useFileConverter());

    act(() => result.current.selectFormat('webm'));
    act(() => result.current.selectConversionMode('audio-extraction'));

    expect(result.current.job.conversionMode).toBe('audio-extraction');
    expect(result.current.job.outputFormat).toBe('mp3');
  });

  it('restores previous video format when switching back from audio extraction mode', () => {
    const { result } = renderHook(() => useFileConverter());

    act(() => result.current.selectFormat('webm'));
    act(() => result.current.selectConversionMode('audio-extraction'));
    act(() => result.current.selectConversionMode('video'));

    expect(result.current.job.conversionMode).toBe('video');
    expect(result.current.job.outputFormat).toBe('webm');
  });

  // Regression (Story 1.5): the mp3-only constraint must apply only in audio mode.
  it('accepts every non-audio format in video mode', () => {
    const { result } = renderHook(() => useFileConverter());

    (['mp4', 'avi', 'mov', 'mkv', 'webm', 'gif'] as const).forEach((format) => {
      act(() => result.current.selectFormat(format));
      expect(result.current.job.outputFormat).toBe(format);
    });
  });

  it('rejects non-mp3 format selection while in audio extraction mode', () => {
    const { result } = renderHook(() => useFileConverter());

    act(() => result.current.selectConversionMode('audio-extraction'));
    act(() => result.current.selectFormat('mp4'));

    // Audio-mode constraint stays contained: output remains mp3.
    expect(result.current.job.outputFormat).toBe('mp3');
  });

  it('preserves crop settings across an audio round-trip so video mode is unaffected', () => {
    const { result } = renderHook(() => useFileConverter());

    act(() => result.current.selectCropMode('16:9'));
    act(() => result.current.updateCustomCrop('width', '1920'));

    act(() => result.current.selectConversionMode('audio-extraction'));
    act(() => result.current.selectConversionMode('video'));

    expect(result.current.job.cropSettings.mode).toBe('16:9');
    expect(result.current.job.cropSettings.custom.width).toBe('1920');
  });

  it('selectCropMode updates crop mode', () => {
    const { result } = renderHook(() => useFileConverter());
    act(() => result.current.selectCropMode('16:9'));
    expect(result.current.job.cropSettings.mode).toBe('16:9');
  });

  it('updateCustomCrop updates custom crop fields', () => {
    const { result } = renderHook(() => useFileConverter());
    act(() => result.current.selectCropMode('custom'));
    act(() => result.current.updateCustomCrop('width', '720'));
    expect(result.current.job.cropSettings.custom.width).toBe('720');
  });

  it('reset clears job to initial state', () => {
    const { result } = renderHook(() => useFileConverter());
    const file = new File([''], 'test.mp4', { type: 'video/mp4' });
    act(() => result.current.selectFile(file));
    act(() => result.current.reset());
    expect(result.current.job.file).toBeNull();
    expect(result.current.job.status).toBe('idle');
  });

  it('startConversion sets status to loading then done', async () => {
    const { result } = renderHook(() => useFileConverter());
    const file = new File([''], 'test.mp4', { type: 'video/mp4' });
    act(() => result.current.selectFile(file));

    await act(async () => {
      await result.current.startConversion();
    });

    expect(result.current.job.status).toBe('done');
    expect(result.current.job.outputUrl).toBe('blob:mock');
    expect(result.current.job.outputFileName).toBe('output.mp4');
    expect(result.current.job.outputSizeBytes).toBe(2048);
    expect(result.current.job.conversionDurationMs).toBeGreaterThan(0);
  });

  it('startConversion uses MP3 output in audio extraction mode', async () => {
    mockTranscode.mockResolvedValueOnce({
      url: 'blob:mp3',
      fileName: 'output.mp3',
      sizeBytes: 1024,
      ffmpegMode: 'multithreaded',
      performanceNote: null,
    });

    const { result } = renderHook(() => useFileConverter());
    const file = new File([''], 'test.mp4', { type: 'video/mp4' });

    act(() => result.current.selectFile(file));
    act(() => result.current.selectConversionMode('audio-extraction'));

    await act(async () => {
      await result.current.startConversion();
    });

    expect(mockTranscode).toHaveBeenCalledWith(
      file,
      'mp3',
      'audio-extraction',
      result.current.job.cropSettings,
      expect.any(Function)
    );
    expect(result.current.job.status).toBe('done');
    expect(result.current.job.outputFileName).toBe('output.mp3');
  });

  it('startConversion passes video mode context in regular conversion mode', async () => {
    const { result } = renderHook(() => useFileConverter());
    const file = new File([''], 'test.mp4', { type: 'video/mp4' });

    act(() => result.current.selectFile(file));

    await act(async () => {
      await result.current.startConversion();
    });

    expect(mockTranscode).toHaveBeenCalledWith(
      file,
      'mp4',
      'video',
      result.current.job.cropSettings,
      expect.any(Function)
    );
  });

  it('startConversion does nothing if no file selected', async () => {
    const { result } = renderHook(() => useFileConverter());
    await act(async () => {
      await result.current.startConversion();
    });
    expect(result.current.job.status).toBe('idle');
  });

  it('startConversion remains blocked for invalid source files', async () => {
    const { result } = renderHook(() => useFileConverter());
    const invalidFile = new File(['not-a-video'], 'document.pdf', { type: 'application/pdf' });

    act(() => result.current.selectFile(invalidFile));

    await act(async () => {
      await result.current.startConversion();
    });

    expect(result.current.job.status).toBe('idle');
    expect(mockTranscode).not.toHaveBeenCalled();
  });
});
