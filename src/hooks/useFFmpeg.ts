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

export interface UseFFmpegReturn {
  isLoaded: boolean;
  isLoading: boolean;
  loadError: string | null;
  loadFFmpeg: () => Promise<void>;
  transcode: (
    file: File,
    outputFormat: VideoFormat,
    cropSettings: CropSettings,
    onProgress: (progress: number) => void
  ) => Promise<{ url: string; fileName: string }>;
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
  outputFormat: VideoFormat,
  outputFileName: string,
  cropFilter: string | null
): string[][] {
  const filterArgs = cropFilter ? ['-vf', cropFilter] : [];

  if (outputFormat === 'webm') {
    return [
      // Primary WebM profile
      ['-i', inputName, ...filterArgs, '-c:v', 'libvpx', '-c:a', 'libvorbis', outputFileName],
      // Fallback profile in case a codec is unavailable
      ['-i', inputName, ...filterArgs, outputFileName],
    ];
  }

  return [
    ['-i', inputName, ...filterArgs, '-preset', 'ultrafast', outputFileName],
    ['-i', inputName, ...filterArgs, outputFileName],
  ];
}

export function useFFmpeg(): UseFFmpegReturn {
  const ffmpegRef = useRef<FFmpeg | null>(null);
  const [isLoaded, setIsLoaded] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const loadFFmpeg = useCallback(async () => {
    if (isLoaded || isLoading) return;
    setIsLoading(true);
    setLoadError(null);
    try {
      const ffmpeg = new FFmpeg();
      ffmpegRef.current = ffmpeg;

      // Try local multi-threaded core first (best performance, uses all CPU cores).
      // Falls back to local single-threaded, then CDN MT, then CDN ST.
      const attempts: Array<() => Promise<boolean>> = [
        async () =>
          ffmpeg.load({
            coreURL: await toBlobURL(`${LOCAL_MT_BASE_URL}/ffmpeg-core.js`, 'text/javascript'),
            wasmURL: await toBlobURL(`${LOCAL_MT_BASE_URL}/ffmpeg-core.wasm`, 'application/wasm'),
            workerURL: await toBlobURL(`${LOCAL_MT_BASE_URL}/ffmpeg-core.worker.js`, 'text/javascript'),
          }),
        async () =>
          ffmpeg.load({
            coreURL: await toBlobURL(`${LOCAL_ST_BASE_URL}/ffmpeg-core.js`, 'text/javascript'),
            wasmURL: await toBlobURL(`${LOCAL_ST_BASE_URL}/ffmpeg-core.wasm`, 'application/wasm'),
          }),
        async () =>
          ffmpeg.load({
            coreURL: await toBlobURL(`${CDN_MT_BASE_URL}/ffmpeg-core.js`, 'text/javascript'),
            wasmURL: await toBlobURL(`${CDN_MT_BASE_URL}/ffmpeg-core.wasm`, 'application/wasm'),
            workerURL: await toBlobURL(`${CDN_MT_BASE_URL}/ffmpeg-core.worker.js`, 'text/javascript'),
          }),
        async () =>
          ffmpeg.load({
            coreURL: await toBlobURL(`${CDN_ST_BASE_URL}/ffmpeg-core.js`, 'text/javascript'),
            wasmURL: await toBlobURL(`${CDN_ST_BASE_URL}/ffmpeg-core.wasm`, 'application/wasm'),
          }),
      ];

      let lastError: unknown;
      for (const attempt of attempts) {
        try {
          await attempt();
          lastError = undefined;
          break;
        } catch (err) {
          lastError = err;
        }
      }
      if (lastError !== undefined) {
        const msg = lastError instanceof Error ? lastError.message : String(lastError);
        throw new Error(`Failed to load FFmpeg engine. ${msg}`);
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
    ): Promise<{ url: string; fileName: string }> => {
      const ffmpeg = ffmpegRef.current;
      if (!ffmpeg) throw new Error('FFmpeg not loaded');

      const inputName = 'input' + file.name.slice(file.name.lastIndexOf('.'));
      const outputFileName = getOutputFileName(file.name, outputFormat);

      // Collect FFmpeg log output so we can include it in error messages.
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
        const attempts = getCommandAttempts(inputName, outputFormat, outputFileName, cropFilter);
        let exitCode = -1;

        for (const command of attempts) {
          exitCode = await ffmpeg.exec(command);
          if (exitCode === 0) break;
        }

        if (exitCode !== 0) {
          // Pick the most relevant log lines (errors/warnings from the tail of the log).
          const relevant = logs
            .filter((l) => /error|invalid|unknown|no such|unsupported|codec|preset/i.test(l))
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

        return { url, fileName: outputFileName };
      } catch (err) {
        // Best-effort cleanup so stale files don't accumulate in the WASM FS.
        await ffmpeg.deleteFile(inputName).catch(() => {});
        await ffmpeg.deleteFile(outputFileName).catch(() => {});

        // Re-throw with enriched context when the original message is empty.
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

  return { isLoaded, isLoading, loadError, loadFFmpeg, transcode };
}
