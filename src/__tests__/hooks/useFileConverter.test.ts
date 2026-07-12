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

const mockExtractPcmWav = jest.fn().mockResolvedValue(new Blob([new Uint8Array([1, 2, 3])]));
const mockTranscribe = jest.fn().mockResolvedValue({
  text: 'hello world',
  chunks: [{ text: 'hello world', timestamp: [0, 1] }],
});

jest.mock('@/hooks/useFFmpeg', () => ({
  useFFmpeg: () => ({
    isLoaded: false,
    isLoading: false,
    loadError: null,
    ffmpegMode: 'multithreaded',
    loadFFmpeg: mockLoadFFmpeg,
    transcode: mockTranscode,
    extractPcmWav: mockExtractPcmWav,
  }),
}));

jest.mock('@/hooks/useTranscriber', () => ({
  useTranscriber: () => ({
    transcribe: mockTranscribe,
    terminate: jest.fn(),
  }),
}));

jest.mock('@/utils/audioUtils', () => ({
  decodeWavToPcm16k: jest.fn().mockResolvedValue(new Float32Array([0.1, 0.2])),
}));

const mockGetHfToken = jest.fn(() => '');
jest.mock('@/utils/hfToken', () => ({
  getHfToken: () => mockGetHfToken(),
}));

const mockTranscribeViaHf = jest.fn();
jest.mock('@/utils/hfTranscribe', () => ({
  transcribeViaHf: (...args: unknown[]) => mockTranscribeViaHf(...args),
}));

beforeAll(() => {
  global.URL.createObjectURL = jest.fn(() => 'blob:transcript');
  global.URL.revokeObjectURL = jest.fn();
});

describe('useFileConverter', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetHfToken.mockReturnValue('');
    mockTranscribeViaHf.mockResolvedValue({
      text: 'hosted text',
      chunks: [{ text: 'hosted text', timestamp: [0, 1] }],
    });
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

  // Transcription mode (Story: audio/video -> text).
  it('switching to transcription mode selects the txt transcript format', () => {
    const { result } = renderHook(() => useFileConverter());

    act(() => result.current.selectConversionMode('transcription'));

    expect(result.current.job.conversionMode).toBe('transcription');
    expect(result.current.job.outputFormat).toBe('txt');
  });

  it('rejects non-transcript formats while in transcription mode', () => {
    const { result } = renderHook(() => useFileConverter());

    act(() => result.current.selectConversionMode('transcription'));
    act(() => result.current.selectFormat('mp4'));

    expect(result.current.job.outputFormat).toBe('txt');
  });

  it('restores the last video and transcript formats across mode round-trips', () => {
    const { result } = renderHook(() => useFileConverter());

    act(() => result.current.selectFormat('webm'));
    act(() => result.current.selectConversionMode('transcription'));
    act(() => result.current.selectFormat('srt'));

    act(() => result.current.selectConversionMode('video'));
    expect(result.current.job.outputFormat).toBe('webm');

    act(() => result.current.selectConversionMode('transcription'));
    expect(result.current.job.outputFormat).toBe('srt');
  });

  it('runs the transcription pipeline and stores the transcript result', async () => {
    const { result } = renderHook(() => useFileConverter());
    const file = new File([''], 'lecture.mp4', { type: 'video/mp4' });

    act(() => result.current.selectFile(file));
    act(() => result.current.selectConversionMode('transcription'));

    await act(async () => {
      await result.current.startConversion();
    });

    expect(mockExtractPcmWav).toHaveBeenCalledWith(file, expect.any(Function));
    expect(mockTranscribe).toHaveBeenCalledWith(expect.any(Float32Array), {
      language: null,
      translate: false,
      onModelProgress: expect.any(Function),
      onTranscribeProgress: expect.any(Function),
      onPartialText: expect.any(Function),
    });
    expect(result.current.job.status).toBe('done');
    expect(result.current.job.transcriptText).toBe('hello world');
    expect(result.current.job.outputFileName).toBe('lecture.txt');
    expect(result.current.job.outputUrl).toBe('blob:transcript');
  });

  it('passes selected language and translate flag to the transcriber', async () => {
    const { result } = renderHook(() => useFileConverter());
    const file = new File([''], 'lecture.mp4', { type: 'video/mp4' });

    act(() => result.current.selectFile(file));
    act(() => result.current.selectConversionMode('transcription'));
    act(() => result.current.selectTranscriptionLanguage('spanish'));
    act(() => result.current.setTranscriptionTranslate(true));

    await act(async () => {
      await result.current.startConversion();
    });

    expect(mockTranscribe).toHaveBeenCalledWith(expect.any(Float32Array), {
      language: 'spanish',
      translate: true,
      onModelProgress: expect.any(Function),
      onTranscribeProgress: expect.any(Function),
      onPartialText: expect.any(Function),
    });
  });

  it('streams partial transcript text into the job while converting', async () => {
    // Drive the onPartialText callback mid-transcription and assert the live text
    // is exposed before the final result resolves.
    let capturedPartial: ((text: string) => void) | undefined;
    mockTranscribe.mockImplementationOnce(async (_audio, options) => {
      capturedPartial = options.onPartialText;
      options.onPartialText?.('Hello');
      options.onPartialText?.('Hello world');
      return { text: 'Hello world', chunks: [{ text: 'Hello world', timestamp: [0, 1] }] };
    });

    const { result } = renderHook(() => useFileConverter());
    const file = new File([''], 'lecture.mp4', { type: 'video/mp4' });

    act(() => result.current.selectFile(file));
    act(() => result.current.selectConversionMode('transcription'));

    await act(async () => {
      await result.current.startConversion();
    });

    expect(capturedPartial).toEqual(expect.any(Function));
    expect(result.current.job.transcriptText).toBe('Hello world');
    expect(result.current.job.status).toBe('done');
  });

  it('uses HF hosted transcription when a token is set, online, and not translating', async () => {
    mockGetHfToken.mockReturnValue('hf_x');

    const { result } = renderHook(() => useFileConverter());
    const file = new File([''], 'lecture.mp4', { type: 'video/mp4' });
    act(() => result.current.selectFile(file));
    act(() => result.current.selectConversionMode('transcription'));

    await act(async () => {
      await result.current.startConversion();
    });

    expect(mockTranscribeViaHf).toHaveBeenCalledWith(
      expect.any(Float32Array),
      expect.objectContaining({ token: 'hf_x' })
    );
    expect(mockTranscribe).not.toHaveBeenCalled();
    expect(result.current.job.transcriptText).toBe('hosted text');
    expect(result.current.job.status).toBe('done');
  });

  it('falls back to the local worker when hosted transcription throws', async () => {
    mockGetHfToken.mockReturnValue('hf_x');
    mockTranscribeViaHf.mockRejectedValueOnce(new Error('CORS blocked'));

    const { result } = renderHook(() => useFileConverter());
    const file = new File([''], 'lecture.mp4', { type: 'video/mp4' });
    act(() => result.current.selectFile(file));
    act(() => result.current.selectConversionMode('transcription'));

    await act(async () => {
      await result.current.startConversion();
    });

    expect(mockTranscribeViaHf).toHaveBeenCalled();
    expect(mockTranscribe).toHaveBeenCalled();
    expect(result.current.job.transcriptText).toBe('hello world');
    expect(result.current.job.status).toBe('done');
  });

  it('uses the local worker when no token is set', async () => {
    const { result } = renderHook(() => useFileConverter());
    const file = new File([''], 'lecture.mp4', { type: 'video/mp4' });
    act(() => result.current.selectFile(file));
    act(() => result.current.selectConversionMode('transcription'));

    await act(async () => {
      await result.current.startConversion();
    });

    expect(mockTranscribeViaHf).not.toHaveBeenCalled();
    expect(mockTranscribe).toHaveBeenCalled();
  });

  it('uses the local worker when translating even with a token', async () => {
    mockGetHfToken.mockReturnValue('hf_x');

    const { result } = renderHook(() => useFileConverter());
    const file = new File([''], 'lecture.mp4', { type: 'video/mp4' });
    act(() => result.current.selectFile(file));
    act(() => result.current.selectConversionMode('transcription'));
    act(() => result.current.setTranscriptionTranslate(true));

    await act(async () => {
      await result.current.startConversion();
    });

    expect(mockTranscribeViaHf).not.toHaveBeenCalled();
    expect(mockTranscribe).toHaveBeenCalledWith(
      expect.any(Float32Array),
      expect.objectContaining({ translate: true })
    );
  });

  it('re-serializes the output file name when the transcript format changes', async () => {
    const { result } = renderHook(() => useFileConverter());
    const file = new File([''], 'lecture.mp4', { type: 'video/mp4' });

    act(() => result.current.selectFile(file));
    act(() => result.current.selectConversionMode('transcription'));
    await act(async () => {
      await result.current.startConversion();
    });

    act(() => result.current.selectFormat('srt'));

    expect(result.current.job.outputFormat).toBe('srt');
    expect(result.current.job.outputFileName).toBe('lecture.srt');
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
