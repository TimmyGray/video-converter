'use client';

import { useState, useRef, useCallback } from 'react';
import { FFmpeg } from '@ffmpeg/ffmpeg';
import { fetchFile, toBlobURL } from '@ffmpeg/util';
import { CropSettings, VideoFormat } from '@/types';
import { getOutputFileName, getFormatInfo } from '@/utils/formatUtils';

const LOCAL_MT_BASE_URL = '/ffmpeg-core-mt';
const LOCAL_ST_BASE_URL = '/ffmpeg-core';
const CDN_MT_BASE_URL = 'https://unpkg.com/@ffmpeg/core-mt@0.12.6/dist/umd';
const CDN_ST_BASE_URL = 'https://unpkg.com/@ffmpeg/core@0.12.6/dist/umd';

export type FFmpegMode = 'multithreaded' | 'single-threaded';

export interface TranscodeResult {
  url: string;
  fileName: string;
  sizeBytes: number;
  ffmpegMode: FFmpegMode | null;
  performanceNote: string | null;
}

export interface UseFFmpegReturn {
  isLoaded: boolean;
  isLoading: boolean;
  loadError: string | null;
  ffmpegMode: FFmpegMode | null;
  loadFFmpeg: () => Promise<void>;
  transcode: (
    file: File,
    outputFormat: VideoFormat,
    cropSettings: CropSettings,
    onProgress: (progress: number) => void
  ) => Promise<TranscodeResult>;
}

function getCropFilter(cropSettings: CropSettings): string | null {
  if (cropSettings.mode === 'none') return null;

  if (cropSettings.mode === 'custom') {
    const widthPct = Number(cropSettings.custom.width);
    const heightPct = Number(cropSettings.custom.height);
    const xPct = cropSettings.custom.x ? Number(cropSettings.custom.x) : 0;
    const yPct = cropSettings.custom.y ? Number(cropSettings.custom.y) : 0;

    if (!Number.isFinite(widthPct) || !Number.isFinite(heightPct) || widthPct <= 0 || heightPct <= 0) {
      throw new Error('Custom crop width and height must be valid percentages greater than 0.');
    }
    if (widthPct > 100 || heightPct > 100) {
      throw new Error('Custom crop width and height percentages cannot exceed 100.');
    }
    if (!Number.isFinite(xPct) || !Number.isFinite(yPct) || xPct < 0 || yPct < 0) {
      throw new Error('Custom crop X and Y must be valid percentages greater than or equal to 0.');
    }
    if (xPct > 100 || yPct > 100) {
      throw new Error('Custom crop X and Y percentages cannot exceed 100.');
    }
    if (xPct + widthPct > 100 || yPct + heightPct > 100) {
      throw new Error('Custom crop must fit inside the source frame: X + Width and Y + Height must be <= 100%.');
    }

    const safeWidthPct = Number(widthPct.toFixed(4));
    const safeHeightPct = Number(heightPct.toFixed(4));
    const safeXPct = Number(xPct.toFixed(4));
    const safeYPct = Number(yPct.toFixed(4));

    return `crop=floor(iw*${safeWidthPct}/100):floor(ih*${safeHeightPct}/100):floor(iw*${safeXPct}/100):floor(ih*${safeYPct}/100)`;
  }

  const ratioMap: Record<'9:16' | '16:9' | '4:3' | '3:4', number> = {
    '9:16': 9 / 16,
    '16:9': 16 / 9,
    '4:3': 4 / 3,
    '3:4': 3 / 4,
  };
  const ratio = ratioMap[cropSettings.mode];

  // Center crop to selected aspect ratio.
  return `crop='if(gte(iw/ih,${ratio}),ih*${ratio},iw):if(gte(iw/ih,${ratio}),ih,iw/${ratio}):if(gte(iw/ih,${ratio}),(iw-ih*${ratio})/2,0):if(gte(iw/ih,${ratio}),0,(ih-iw/${ratio})/2)'`;
}

function getCommandAttempts(
  inputName: string,
  inputFileName: string,
  outputFormat: VideoFormat,
  outputFileName: string,
  cropFilter: string | null
): string[][] {
  const filterArgs = cropFilter ? ['-vf', cropFilter] : [];

  if (outputFormat === 'webm') {
    const isWebmInput = /\.webm$/i.test(inputFileName);

    return [
      ...(isWebmInput && !cropFilter ? [['-i', inputName, '-c', 'copy', outputFileName]] : []),
      // Fast WebM profile tuned for WASM encoding speed.
      [
        '-i',
        inputName,
        ...filterArgs,
        '-c:v',
        'libvpx',
        '-deadline',
        'realtime',
        '-cpu-used',
        '8',
        '-crf',
        '36',
        '-b:v',
        '0',
        '-threads',
        '4',
        '-c:a',
        'libvorbis',
        '-q:a',
        '5',
        outputFileName,
      ],
      // Fallback profile if speed-tuned args are unsupported.
      ['-i', inputName, ...filterArgs, '-c:v', 'libvpx', '-c:a', 'libvorbis', outputFileName],
      ['-i', inputName, ...filterArgs, outputFileName],
    ];
  }

  return [
    ['-i', inputName, ...filterArgs, '-preset', 'ultrafast', outputFileName],
    ['-i', inputName, ...filterArgs, outputFileName],
  ];
}

function getWebmPerformanceNote(outputFormat: VideoFormat, ffmpegMode: FFmpegMode | null): string | null {
  if (outputFormat !== 'webm') return null;

  if (ffmpegMode === 'single-threaded') {
    return 'WebM is encoded by libvpx in software and FFmpeg is running in single-threaded mode, so conversion can be very slow.';
  }

  return 'WebM is encoded by libvpx in software (WebAssembly), which is usually slower than MP4/H.264.';
}

export function useFFmpeg(): UseFFmpegReturn {
  const ffmpegRef = useRef<FFmpeg | null>(null);
  const ffmpegModeRef = useRef<FFmpegMode | null>(null);
  const [isLoaded, setIsLoaded] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [ffmpegMode, setFfmpegMode] = useState<FFmpegMode | null>(null);

  const loadFFmpeg = useCallback(async () => {
    if (isLoaded || isLoading) return;

    setIsLoading(true);
    setLoadError(null);
    setFfmpegMode(null);
    ffmpegModeRef.current = null;

    try {
      const ffmpeg = new FFmpeg();
      ffmpegRef.current = ffmpeg;

      const attempts: Array<{ mode: FFmpegMode; load: () => Promise<boolean> }> = [
        {
          mode: 'multithreaded',
          load: async () =>
            ffmpeg.load({
              coreURL: await toBlobURL(`${LOCAL_MT_BASE_URL}/ffmpeg-core.js`, 'text/javascript'),
              wasmURL: await toBlobURL(`${LOCAL_MT_BASE_URL}/ffmpeg-core.wasm`, 'application/wasm'),
              workerURL: await toBlobURL(`${LOCAL_MT_BASE_URL}/ffmpeg-core.worker.js`, 'text/javascript'),
            }),
        },
        {
          mode: 'single-threaded',
          load: async () =>
            ffmpeg.load({
              coreURL: await toBlobURL(`${LOCAL_ST_BASE_URL}/ffmpeg-core.js`, 'text/javascript'),
              wasmURL: await toBlobURL(`${LOCAL_ST_BASE_URL}/ffmpeg-core.wasm`, 'application/wasm'),
            }),
        },
        {
          mode: 'multithreaded',
          load: async () =>
            ffmpeg.load({
              coreURL: await toBlobURL(`${CDN_MT_BASE_URL}/ffmpeg-core.js`, 'text/javascript'),
              wasmURL: await toBlobURL(`${CDN_MT_BASE_URL}/ffmpeg-core.wasm`, 'application/wasm'),
              workerURL: await toBlobURL(`${CDN_MT_BASE_URL}/ffmpeg-core.worker.js`, 'text/javascript'),
            }),
        },
        {
          mode: 'single-threaded',
          load: async () =>
            ffmpeg.load({
              coreURL: await toBlobURL(`${CDN_ST_BASE_URL}/ffmpeg-core.js`, 'text/javascript'),
              wasmURL: await toBlobURL(`${CDN_ST_BASE_URL}/ffmpeg-core.wasm`, 'application/wasm'),
            }),
        },
      ];

      let lastError: unknown;
      for (const attempt of attempts) {
        try {
          await attempt.load();
          ffmpegModeRef.current = attempt.mode;
          setFfmpegMode(attempt.mode);
          lastError = undefined;
          break;
        } catch (err) {
          lastError = err;
        }
      }

      if (lastError !== undefined) {
        const message = lastError instanceof Error ? lastError.message : String(lastError);
        throw new Error(`Failed to load FFmpeg engine. ${message}`);
      }

      setIsLoaded(true);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load FFmpeg engine';
      setLoadError(message);
    } finally {
      setIsLoading(false);
    }
  }, [isLoaded, isLoading]);

  const transcode = useCallback(
    async (
      file: File,
      outputFormat: VideoFormat,
      cropSettings: CropSettings,
      onProgress: (progress: number) => void
    ): Promise<TranscodeResult> => {
      const ffmpeg = ffmpegRef.current;
      if (!ffmpeg) throw new Error('FFmpeg not loaded');

      const extensionIndex = file.name.lastIndexOf('.');
      const inputExtension = extensionIndex >= 0 ? file.name.slice(extensionIndex) : '';
      const inputName = `input${inputExtension}`;
      const outputFileName = getOutputFileName(file.name, outputFormat);

      const logs: string[] = [];
      const logHandler = ({ message }: { message: string }) => {
        logs.push(message);
      };
      ffmpeg.on('log', logHandler);

      const progressHandler = ({ progress }: { progress: number }) => {
        onProgress(Math.round(Math.min(progress * 100, 100)));
      };
      ffmpeg.on('progress', progressHandler);

      try {
        await ffmpeg.writeFile(inputName, await fetchFile(file));

        const cropFilter = getCropFilter(cropSettings);
        const attempts = getCommandAttempts(inputName, file.name, outputFormat, outputFileName, cropFilter);
        let exitCode = -1;

        for (const command of attempts) {
          exitCode = await ffmpeg.exec(command);
          if (exitCode === 0) break;
        }

        if (exitCode !== 0) {
          const relevant = logs
            .filter((line) => /error|invalid|unknown|no such|unsupported|codec|preset/i.test(line))
            .slice(-8);
          const detail = (relevant.length > 0 ? relevant : logs.slice(-8)).join('\n');
          throw new Error(`FFmpeg failed after retry. ${detail || 'No details available.'}`);
        }

        const data = await ffmpeg.readFile(outputFileName);
        const blob = new Blob([data as unknown as ArrayBuffer], {
          type: getFormatInfo(outputFormat).mimeType,
        });
        const url = URL.createObjectURL(blob);

        await ffmpeg.deleteFile(inputName).catch(() => {});
        await ffmpeg.deleteFile(outputFileName).catch(() => {});

        return {
          url,
          fileName: outputFileName,
          sizeBytes: blob.size,
          ffmpegMode: ffmpegModeRef.current,
          performanceNote: getWebmPerformanceNote(outputFormat, ffmpegModeRef.current),
        };
      } catch (err) {
        await ffmpeg.deleteFile(inputName).catch(() => {});
        await ffmpeg.deleteFile(outputFileName).catch(() => {});

        if (err instanceof Error && !err.message) {
          throw new Error(`Conversion failed (no details from FFmpeg). Log:\n${logs.slice(-10).join('\n')}`);
        }
        throw err;
      } finally {
        ffmpeg.off('log', logHandler);
        ffmpeg.off('progress', progressHandler);
      }
    },
    []
  );

  return { isLoaded, isLoading, loadError, ffmpegMode, loadFFmpeg, transcode };
}
