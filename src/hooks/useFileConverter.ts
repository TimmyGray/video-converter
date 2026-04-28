'use client';

import { useState, useCallback } from 'react';
import { ConversionJob, VideoFormat } from '@/types';
import { useFFmpeg } from './useFFmpeg';

export interface UseFileConverterReturn {
  job: ConversionJob;
  isFFmpegLoaded: boolean;
  isFFmpegLoading: boolean;
  ffmpegLoadError: string | null;
  selectFile: (file: File) => void;
  selectFormat: (format: VideoFormat) => void;
  startConversion: () => Promise<void>;
  reset: () => void;
}

const initialJob: ConversionJob = {
  file: null,
  outputFormat: 'mp4',
  status: 'idle',
  progress: 0,
  outputUrl: null,
  outputFileName: null,
  errorMessage: null,
};

export function useFileConverter(): UseFileConverterReturn {
  const [job, setJob] = useState<ConversionJob>(initialJob);
  const { isLoaded, isLoading, loadError, loadFFmpeg, transcode } = useFFmpeg();

  const selectFile = useCallback((file: File) => {
    setJob((prev) => ({
      ...initialJob,
      outputFormat: prev.outputFormat,
      file,
    }));
  }, []);

  const selectFormat = useCallback((format: VideoFormat) => {
    setJob((prev) => ({ ...prev, outputFormat: format }));
  }, []);

  const startConversion = useCallback(async () => {
    if (!job.file) return;

    setJob((prev) => ({ ...prev, status: 'loading', progress: 0, errorMessage: null }));

    try {
      if (!isLoaded) {
        await loadFFmpeg();
      }

      setJob((prev) => ({ ...prev, status: 'converting' }));

      const { url, fileName } = await transcode(
        job.file,
        job.outputFormat,
        (progress) => setJob((prev) => ({ ...prev, progress }))
      );

      setJob((prev) => ({
        ...prev,
        status: 'done',
        progress: 100,
        outputUrl: url,
        outputFileName: fileName,
      }));
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Conversion failed';
      setJob((prev) => ({ ...prev, status: 'error', errorMessage: message }));
    }
  }, [job.file, job.outputFormat, isLoaded, loadFFmpeg, transcode]);

  const reset = useCallback(() => {
    if (job.outputUrl) URL.revokeObjectURL(job.outputUrl);
    setJob(initialJob);
  }, [job.outputUrl]);

  return {
    job,
    isFFmpegLoaded: isLoaded,
    isFFmpegLoading: isLoading,
    ffmpegLoadError: loadError,
    selectFile,
    selectFormat,
    startConversion,
    reset,
  };
}
