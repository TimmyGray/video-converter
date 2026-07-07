'use client';

import { useState, useRef, useCallback } from 'react';
import { ConversionJob, ConversionMode, CropMode, VideoFormat } from '@/types';
import { useFFmpeg } from '@/hooks/useFFmpeg';
import { isValidVideoFile } from '@/utils/formatUtils';

export interface UseFileConverterReturn {
  job: ConversionJob;
  isFFmpegLoaded: boolean;
  isFFmpegLoading: boolean;
  ffmpegLoadError: string | null;
  selectFile: (file: File) => void;
  selectConversionMode: (mode: ConversionMode) => void;
  selectFormat: (format: VideoFormat) => void;
  selectCropMode: (mode: CropMode) => void;
  updateCustomCrop: (field: 'width' | 'height' | 'x' | 'y', value: string) => void;
  startConversion: () => Promise<void>;
  reset: () => void;
}

const initialJob: ConversionJob = {
  file: null,
  conversionMode: 'video',
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
  outputSizeBytes: null,
  conversionDurationMs: null,
  ffmpegMode: null,
  performanceNote: null,
  errorMessage: null,
};

export function useFileConverter(): UseFileConverterReturn {
  const [job, setJob] = useState<ConversionJob>(initialJob);
  const lastVideoFormatRef = useRef<Exclude<VideoFormat, 'mp3'>>('mp4');
  const { isLoaded, isLoading, loadError, ffmpegMode, loadFFmpeg, transcode } = useFFmpeg();

  const selectFile = useCallback((file: File) => {
    setJob((prev) => ({
      ...initialJob,
      conversionMode: prev.conversionMode,
      outputFormat: prev.outputFormat,
      cropSettings: prev.cropSettings,
      ffmpegMode: prev.ffmpegMode,
      file,
    }));
  }, []);

  const selectConversionMode = useCallback((mode: ConversionMode) => {
    setJob((prev) => {
      if (mode === prev.conversionMode) return prev;

      if (mode === 'audio-extraction') {
        if (prev.outputFormat !== 'mp3') {
          lastVideoFormatRef.current = prev.outputFormat as Exclude<VideoFormat, 'mp3'>;
        }

        return {
          ...prev,
          conversionMode: mode,
          outputFormat: 'mp3',
        };
      }

      return {
        ...prev,
        conversionMode: mode,
        outputFormat: prev.outputFormat === 'mp3' ? lastVideoFormatRef.current : prev.outputFormat,
      };
    });
  }, []);

  const selectFormat = useCallback((format: VideoFormat) => {
    setJob((prev) => {
      if (prev.conversionMode === 'audio-extraction' && format !== 'mp3') {
        return prev;
      }

      if (format !== 'mp3') {
        lastVideoFormatRef.current = format as Exclude<VideoFormat, 'mp3'>;
      }

      return { ...prev, outputFormat: format };
    });
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
    if (!job.file || !isValidVideoFile(job.file)) return;

    setJob((prev) => ({
      ...prev,
      status: 'loading',
      progress: 0,
      outputUrl: null,
      outputFileName: null,
      outputSizeBytes: null,
      conversionDurationMs: null,
      performanceNote: null,
      errorMessage: null,
    }));

    try {
      if (!isLoaded) {
        await loadFFmpeg();
      }

      setJob((prev) => ({ ...prev, status: 'converting', ffmpegMode: ffmpegMode ?? prev.ffmpegMode }));
      const conversionStart = performance.now();

      const { url, fileName, sizeBytes, ffmpegMode: usedMode, performanceNote } = await transcode(
        job.file,
        job.outputFormat,
        job.conversionMode,
        job.cropSettings,
        (progress: number) => setJob((prev) => ({ ...prev, progress }))
      );
      const durationMs = Math.max(1, Math.round(performance.now() - conversionStart));

      setJob((prev) => ({
        ...prev,
        status: 'done',
        progress: 100,
        outputUrl: url,
        outputFileName: fileName,
        outputSizeBytes: sizeBytes,
        conversionDurationMs: durationMs,
        ffmpegMode: usedMode,
        performanceNote,
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
  }, [job.file, job.outputFormat, job.cropSettings, isLoaded, ffmpegMode, loadFFmpeg, transcode]);

  const reset = useCallback(() => {
    if (job.outputUrl) URL.revokeObjectURL(job.outputUrl);
    lastVideoFormatRef.current = 'mp4';
    setJob(initialJob);
  }, [job.outputUrl]);

  return {
    job,
    isFFmpegLoaded: isLoaded,
    isFFmpegLoading: isLoading,
    ffmpegLoadError: loadError,
    selectFile,
    selectConversionMode,
    selectFormat,
    selectCropMode,
    updateCustomCrop,
    startConversion,
    reset,
  };
}
