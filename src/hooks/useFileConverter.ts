'use client';

import { useState, useCallback } from 'react';
import { ConversionJob, CropMode, VideoFormat } from '@/types';
import { useFFmpeg } from './useFFmpeg';

export interface UseFileConverterReturn {
  job: ConversionJob;
  isFFmpegLoaded: boolean;
  isFFmpegLoading: boolean;
  ffmpegLoadError: string | null;
  selectFile: (file: File) => void;
  selectFormat: (format: VideoFormat) => void;
  selectCropMode: (mode: CropMode) => void;
  updateCustomCrop: (field: 'width' | 'height' | 'x' | 'y', value: string) => void;
  startConversion: () => Promise<void>;
  reset: () => void;
}

const initialJob: ConversionJob = {
  file: null,
  outputFormat: 'mp4',
  cropSettings: {
    mode: 'none',
    custom: {
      width: '',
      height: '',
      x: '0',
      y: '0',
    },
  },
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
      cropSettings: prev.cropSettings,
      file,
    }));
  }, []);

  const selectFormat = useCallback((format: VideoFormat) => {
    setJob((prev) => ({ ...prev, outputFormat: format }));
  }, []);

  const selectCropMode = useCallback((mode: CropMode) => {
    setJob((prev) => ({
      ...prev,
      cropSettings: {
        ...prev.cropSettings,
        mode,
      },
    }));
  }, []);

  const updateCustomCrop = useCallback((field: 'width' | 'height' | 'x' | 'y', value: string) => {
    setJob((prev) => ({
      ...prev,
      cropSettings: {
        ...prev.cropSettings,
        custom: {
          ...prev.cropSettings.custom,
          [field]: value,
        },
      },
    }));
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
        job.cropSettings,
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
      console.error('[VideoConverter] Conversion error:', err);
      let message: string;
      if (err instanceof Error && err.message) {
        message = err.message;
      } else if (typeof err === 'string' && err) {
        message = err;
      } else {
        // Last resort: stringify whatever was thrown so it is visible in the UI.
        try {
          message = `Unexpected error: ${JSON.stringify(err)}`;
        } catch {
          message = 'Conversion failed. Please try a different file or format.';
        }
      }
      setJob((prev) => ({ ...prev, status: 'error', errorMessage: message }));
    }
  }, [job.file, job.outputFormat, job.cropSettings, isLoaded, loadFFmpeg, transcode]);

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
    selectCropMode,
    updateCustomCrop,
    startConversion,
    reset,
  };
}
