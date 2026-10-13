'use client';

import { useCallback, useEffect, useRef } from 'react';
import {
  createLocalTranscriptionSession,
  type LocalTranscribeOptions,
  type LocalTranscriptResult,
  type LocalTranscriptionSession,
} from '@/utils/localTranscriptionSession';

export type TranscribeOptions = LocalTranscribeOptions;
export type TranscriptResult = LocalTranscriptResult;
export type { SkippedSegment } from '@/utils/localTranscriptionSession';

export interface UseTranscriberReturn {
  transcribe: (audio: Float32Array, options: TranscribeOptions) => Promise<TranscriptResult>;
  terminate: () => void;
}

function createWhisperWorker(): Worker {
  return new Worker(new URL('../workers/whisper.worker.ts', import.meta.url), { type: 'module' });
}

export function useTranscriber(): UseTranscriberReturn {
  const sessionRef = useRef<LocalTranscriptionSession | null>(null);

  const getSession = useCallback((): LocalTranscriptionSession => {
    if (!sessionRef.current) {
      sessionRef.current = createLocalTranscriptionSession(createWhisperWorker);
    }
    return sessionRef.current;
  }, []);

  const transcribe = useCallback(
    (audio: Float32Array, options: TranscribeOptions) => getSession().run(audio, options),
    [getSession]
  );

  const terminate = useCallback(() => {
    sessionRef.current?.cancel();
  }, []);

  useEffect(() => {
    return () => {
      sessionRef.current?.dispose();
      sessionRef.current = null;
    };
  }, []);

  return { transcribe, terminate };
}
