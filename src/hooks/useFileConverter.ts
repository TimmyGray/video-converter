'use client';

import { useState, useRef, useCallback } from 'react';
import { ConversionJob, ConversionMode, CropMode, TranscriptFormat, VideoFormat } from '@/types';
import { useFFmpeg } from '@/hooks/useFFmpeg';
import { useTranscriber } from '@/hooks/useTranscriber';
import { getFormatInfo, getOutputFileName, isValidSourceFile } from '@/utils/formatUtils';
import { decodeWavToPcm16k } from '@/utils/audioUtils';
import { serializeTranscript } from '@/utils/subtitleUtils';

const TRANSCRIPT_FORMATS: TranscriptFormat[] = ['txt', 'srt', 'vtt'];

function isTranscriptFormat(format: VideoFormat): format is TranscriptFormat {
  return (TRANSCRIPT_FORMATS as VideoFormat[]).includes(format);
}

function isVideoFormat(format: VideoFormat): boolean {
  return format !== 'mp3' && !isTranscriptFormat(format);
}

interface TranscriptOutput {
  outputUrl: string;
  outputFileName: string;
  outputSizeBytes: number;
}

/** Serializes a transcript to the chosen format and wraps it in a downloadable blob URL. */
function buildTranscriptOutput(
  file: File | null,
  format: TranscriptFormat,
  text: string,
  chunks: ConversionJob['transcriptChunks'],
  previousUrl: string | null
): TranscriptOutput {
  if (previousUrl) URL.revokeObjectURL(previousUrl);

  const content = serializeTranscript(format, text, chunks ?? []);
  const blob = new Blob([content], { type: getFormatInfo(format).mimeType });

  return {
    outputUrl: URL.createObjectURL(blob),
    outputFileName: getOutputFileName(file?.name ?? 'transcript', format, 'transcription'),
    outputSizeBytes: blob.size,
  };
}

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
  selectTranscriptionLanguage: (language: string | null) => void;
  setTranscriptionTranslate: (translate: boolean) => void;
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
  transcriptionLanguage: null,
  transcriptionTranslate: false,
  transcriptText: null,
  transcriptChunks: null,
};

export function useFileConverter(): UseFileConverterReturn {
  const [job, setJob] = useState<ConversionJob>(initialJob);
  const lastVideoFormatRef = useRef<VideoFormat>('mp4');
  const lastTranscriptFormatRef = useRef<TranscriptFormat>('txt');
  const { isLoaded, isLoading, loadError, ffmpegMode, loadFFmpeg, transcode, extractPcmWav } = useFFmpeg();
  const { transcribe } = useTranscriber();

  const selectFile = useCallback((file: File) => {
    setJob((prev) => ({
      ...initialJob,
      conversionMode: prev.conversionMode,
      outputFormat: prev.outputFormat,
      cropSettings: prev.cropSettings,
      ffmpegMode: prev.ffmpegMode,
      transcriptionLanguage: prev.transcriptionLanguage,
      transcriptionTranslate: prev.transcriptionTranslate,
      file,
    }));
  }, []);

  const selectConversionMode = useCallback((mode: ConversionMode) => {
    setJob((prev) => {
      if (mode === prev.conversionMode) return prev;

      // Remember the current format so it can be restored when returning to its mode.
      if (isVideoFormat(prev.outputFormat)) {
        lastVideoFormatRef.current = prev.outputFormat;
      } else if (isTranscriptFormat(prev.outputFormat)) {
        lastTranscriptFormatRef.current = prev.outputFormat;
      }

      const nextFormat: VideoFormat =
        mode === 'audio-extraction'
          ? 'mp3'
          : mode === 'transcription'
            ? lastTranscriptFormatRef.current
            : lastVideoFormatRef.current;

      // Switching modes invalidates any prior output/transcript.
      if (prev.outputUrl) URL.revokeObjectURL(prev.outputUrl);

      return {
        ...prev,
        conversionMode: mode,
        outputFormat: nextFormat,
        status: prev.status === 'done' || prev.status === 'error' ? 'idle' : prev.status,
        progress: 0,
        outputUrl: null,
        outputFileName: null,
        outputSizeBytes: null,
        transcriptText: null,
        transcriptChunks: null,
        errorMessage: null,
      };
    });
  }, []);

  const selectFormat = useCallback((format: VideoFormat) => {
    setJob((prev) => {
      if (prev.conversionMode === 'audio-extraction' && format !== 'mp3') return prev;
      if (prev.conversionMode === 'transcription' && !isTranscriptFormat(format)) return prev;
      if (prev.conversionMode === 'video' && !isVideoFormat(format)) return prev;

      if (isVideoFormat(format)) lastVideoFormatRef.current = format;
      if (isTranscriptFormat(format)) lastTranscriptFormatRef.current = format;

      // If a transcript already exists, re-serialize it into the newly selected format.
      if (
        prev.conversionMode === 'transcription' &&
        isTranscriptFormat(format) &&
        prev.transcriptText !== null
      ) {
        const output = buildTranscriptOutput(
          prev.file,
          format,
          prev.transcriptText,
          prev.transcriptChunks,
          prev.outputUrl
        );
        return { ...prev, outputFormat: format, ...output };
      }

      return { ...prev, outputFormat: format };
    });
  }, []);

  const selectTranscriptionLanguage = useCallback((language: string | null) => {
    setJob((prev) => ({ ...prev, transcriptionLanguage: language }));
  }, []);

  const setTranscriptionTranslate = useCallback((translate: boolean) => {
    setJob((prev) => ({ ...prev, transcriptionTranslate: translate }));
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
    if (!job.file || !isValidSourceFile(job.file, job.conversionMode)) return;

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
      transcriptText: null,
      transcriptChunks: null,
    }));

    try {
      if (!isLoaded) {
        await loadFFmpeg();
      }

      setJob((prev) => ({ ...prev, status: 'converting', ffmpegMode: ffmpegMode ?? prev.ffmpegMode }));
      const conversionStart = performance.now();

      if (job.conversionMode === 'transcription') {
        // 1. Normalize to 16 kHz mono WAV via FFmpeg (0–15% of the bar).
        const wavBlob = await extractPcmWav(job.file, (progress: number) =>
          setJob((prev) => ({ ...prev, progress: Math.round(progress * 0.15) }))
        );

        // 2. Decode to a Float32 waveform Whisper can consume.
        setJob((prev) => ({ ...prev, progress: 15 }));
        const pcm = await decodeWavToPcm16k(wavBlob);

        // 3. Run Whisper in the worker (model download maps to 15–80%, transcription 80–100%).
        const { text, chunks } = await transcribe(pcm, {
          language: job.transcriptionLanguage,
          translate: job.transcriptionTranslate,
          onModelProgress: (percent: number) =>
            setJob((prev) => ({ ...prev, progress: 15 + Math.round(percent * 0.65) })),
          onTranscribeProgress: (percent: number) =>
            setJob((prev) => ({ ...prev, progress: 80 + Math.round(percent * 0.2) })),
        });

        const transcriptFormat: TranscriptFormat = isTranscriptFormat(job.outputFormat)
          ? job.outputFormat
          : 'txt';
        const output = buildTranscriptOutput(job.file, transcriptFormat, text, chunks, null);
        const durationMs = Math.max(1, Math.round(performance.now() - conversionStart));

        setJob((prev) => ({
          ...prev,
          status: 'done',
          progress: 100,
          transcriptText: text,
          transcriptChunks: chunks,
          conversionDurationMs: durationMs,
          performanceNote: null,
          ...output,
        }));
        return;
      }

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
  }, [
    job.file,
    job.outputFormat,
    job.conversionMode,
    job.cropSettings,
    job.transcriptionLanguage,
    job.transcriptionTranslate,
    isLoaded,
    ffmpegMode,
    loadFFmpeg,
    transcode,
    extractPcmWav,
    transcribe,
  ]);

  const reset = useCallback(() => {
    if (job.outputUrl) URL.revokeObjectURL(job.outputUrl);
    lastVideoFormatRef.current = 'mp4';
    lastTranscriptFormatRef.current = 'txt';
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
    selectTranscriptionLanguage,
    setTranscriptionTranslate,
    startConversion,
    reset,
  };
}
