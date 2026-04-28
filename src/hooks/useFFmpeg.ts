'use client';

import { useState, useRef, useCallback } from 'react';
import { FFmpeg } from '@ffmpeg/ffmpeg';
import { fetchFile, toBlobURL } from '@ffmpeg/util';
import { VideoFormat } from '@/types';
import { getOutputFileName } from '@/utils/formatUtils';

const BASE_URL = 'https://unpkg.com/@ffmpeg/core@0.12.6/dist/umd';

export interface UseFFmpegReturn {
  isLoaded: boolean;
  isLoading: boolean;
  loadError: string | null;
  loadFFmpeg: () => Promise<void>;
  transcode: (
    file: File,
    outputFormat: VideoFormat,
    onProgress: (progress: number) => void
  ) => Promise<{ url: string; fileName: string }>;
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
      await ffmpeg.load({
        coreURL: await toBlobURL(`${BASE_URL}/ffmpeg-core.js`, 'text/javascript'),
        wasmURL: await toBlobURL(`${BASE_URL}/ffmpeg-core.wasm`, 'application/wasm'),
      });
      setIsLoaded(true);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load FFmpeg';
      setLoadError(message);
    } finally {
      setIsLoading(false);
    }
  }, [isLoaded, isLoading]);

  const transcode = useCallback(
    async (
      file: File,
      outputFormat: VideoFormat,
      onProgress: (progress: number) => void
    ): Promise<{ url: string; fileName: string }> => {
      const ffmpeg = ffmpegRef.current;
      if (!ffmpeg) throw new Error('FFmpeg not loaded');

      const inputName = 'input' + file.name.slice(file.name.lastIndexOf('.'));
      const outputFileName = getOutputFileName(file.name, outputFormat);

      ffmpeg.on('progress', ({ progress }) => {
        onProgress(Math.round(Math.min(progress * 100, 100)));
      });

      await ffmpeg.writeFile(inputName, await fetchFile(file));
      await ffmpeg.exec(['-i', inputName, '-preset', 'ultrafast', outputFileName]);

      const data = await ffmpeg.readFile(outputFileName);
      const blob = new Blob([data as unknown as ArrayBuffer], { type: 'video/' + outputFormat });
      const url = URL.createObjectURL(blob);

      await ffmpeg.deleteFile(inputName);
      await ffmpeg.deleteFile(outputFileName);

      return { url, fileName: outputFileName };
    },
    []
  );

  return { isLoaded, isLoading, loadError, loadFFmpeg, transcode };
}
