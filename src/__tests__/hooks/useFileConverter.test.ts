import { renderHook, act } from '@testing-library/react';
import { useFileConverter } from '@/hooks/useFileConverter';

jest.mock('@/hooks/useFFmpeg', () => ({
  useFFmpeg: () => ({
    isLoaded: false,
    isLoading: false,
    loadError: null,
    loadFFmpeg: jest.fn().mockResolvedValue(undefined),
    transcode: jest.fn().mockResolvedValue({ url: 'blob:mock', fileName: 'output.mp4' }),
  }),
}));

describe('useFileConverter', () => {
  it('initialises with default state', () => {
    const { result } = renderHook(() => useFileConverter());
    expect(result.current.job.file).toBeNull();
    expect(result.current.job.status).toBe('idle');
    expect(result.current.job.outputFormat).toBe('mp4');
    expect(result.current.job.progress).toBe(0);
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
  });

  it('startConversion does nothing if no file selected', async () => {
    const { result } = renderHook(() => useFileConverter());
    await act(async () => {
      await result.current.startConversion();
    });
    expect(result.current.job.status).toBe('idle');
  });
});
