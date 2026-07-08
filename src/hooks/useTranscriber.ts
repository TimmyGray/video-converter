'use client';

import { useCallback, useEffect, useRef } from 'react';
import type { TranscriptChunk } from '@/types';
import type { TranscribeRequest, WorkerOutbound } from '@/workers/whisper.worker';

export interface TranscribeOptions {
  language: string | null;
  translate: boolean;
  onModelProgress?: (percent: number) => void;
}

export interface TranscriptResult {
  text: string;
  chunks: TranscriptChunk[];
}

export interface UseTranscriberReturn {
  transcribe: (audio: Float32Array, options: TranscribeOptions) => Promise<TranscriptResult>;
  terminate: () => void;
}

export function useTranscriber(): UseTranscriberReturn {
  const workerRef = useRef<Worker | null>(null);
  const requestIdRef = useRef(0);

  const getWorker = useCallback((): Worker => {
    if (!workerRef.current) {
      workerRef.current = new Worker(new URL('../workers/whisper.worker.ts', import.meta.url), {
        type: 'module',
      });
    }
    return workerRef.current;
  }, []);

  const transcribe = useCallback(
    (audio: Float32Array, options: TranscribeOptions): Promise<TranscriptResult> => {
      const worker = getWorker();
      const id = ++requestIdRef.current;
      const fileProgress = new Map<string, number>();

      return new Promise<TranscriptResult>((resolve, reject) => {
        const cleanup = () => {
          worker.removeEventListener('message', handleMessage);
          worker.removeEventListener('error', handleError);
        };

        const handleMessage = (event: MessageEvent<WorkerOutbound>) => {
          const message = event.data;
          if (!message || message.id !== id) return;

          switch (message.type) {
            case 'model-progress': {
              const { file, progress } = message.data;
              if (options.onModelProgress && file && typeof progress === 'number') {
                fileProgress.set(file, progress);
                const values = [...fileProgress.values()];
                const average = values.reduce((sum, value) => sum + value, 0) / values.length;
                options.onModelProgress(Math.round(average));
              }
              break;
            }
            case 'result':
              cleanup();
              resolve({ text: message.text, chunks: message.chunks });
              break;
            case 'error':
              cleanup();
              reject(new Error(message.message));
              break;
            default:
              break;
          }
        };

        const handleError = (event: ErrorEvent) => {
          cleanup();
          reject(new Error(event.message || 'Transcription worker failed to run.'));
        };

        worker.addEventListener('message', handleMessage);
        worker.addEventListener('error', handleError);

        const request: TranscribeRequest = {
          type: 'transcribe',
          id,
          audio,
          language: options.language,
          translate: options.translate,
        };
        worker.postMessage(request);
      });
    },
    [getWorker]
  );

  const terminate = useCallback(() => {
    workerRef.current?.terminate();
    workerRef.current = null;
  }, []);

  useEffect(() => {
    return () => {
      workerRef.current?.terminate();
      workerRef.current = null;
    };
  }, []);

  return { transcribe, terminate };
}
