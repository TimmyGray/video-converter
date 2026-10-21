import type { TranscriptChunk } from '@/types';
import { HfTranscribeError, transcribeViaHf, type HfTranscribeCheckpoint } from '@/utils/hfTranscribe';
import { describePolishFailure, polishTranscript } from '@/utils/hfPolish';
import type { LocalTranscriptionSession, SkippedSegment } from '@/utils/localTranscriptionSession';
import { describeSkippedSegments } from '@/utils/localTranscriptionSession';
import { polishViaOpenRouter } from '@/utils/openRouterPolish';
import { formatClock } from '@/utils/formatUtils';
import { SEGMENT_SECONDS, joinTranscriptText } from '@/utils/transcriptionSegments';

export type Stage = 'extracting' | 'transcribing-hosted' | 'loading-model' | 'transcribing-local' | 'polishing';
export type LogLevel = 'info' | 'warn';

export interface PipelineDeps {
  hfToken: string;
  openRouterToken: string;
  extractPcm: (input: string, options: { signal?: AbortSignal; onProgress?: (fraction: number) => void }) => Promise<Float32Array>;
  transcribeHosted: typeof transcribeViaHf;
  localSession: Pick<LocalTranscriptionSession, 'run' | 'cancel'>;
  polishHf: typeof polishTranscript;
  polishOpenRouter: typeof polishViaOpenRouter;
}

export interface PipelineCallbacks {
  signal: AbortSignal;
  onStage: (stage: Stage) => void;
  onProgress: (percent: number) => void;
  onLog: (level: LogLevel, message: string) => void;
}

export interface TranscriptResult {
  text: string;
  chunks: TranscriptChunk[];
}

function describeHostedFailure(error: unknown, resumedAtSeconds: number): string {
  const status = error instanceof HfTranscribeError ? error.status : undefined;
  const cause = status !== undefined ? `HTTP ${status}` : 'network error';
  const kept = resumedAtSeconds > 0 ? `, kept the first ${formatClock(resumedAtSeconds)}` : '';
  return `Hosted transcription failed (${cause})${kept} - continuing on this machine`;
}

export async function transcribeVideo(
  file: string,
  deps: PipelineDeps,
  { signal, onStage, onProgress, onLog }: PipelineCallbacks
): Promise<TranscriptResult> {
  const { hfToken, openRouterToken } = deps;
  const willPolish = Boolean(hfToken || openRouterToken);
  const setProgress = (value: number) => onProgress(Math.round(willPolish ? value * 0.9 : value));

  const cancelLocal = () => deps.localSession.cancel();
  signal.addEventListener('abort', cancelLocal, { once: true });

  try {
    onStage('extracting');
    setProgress(0);
    const pcm = await deps.extractPcm(file, {
      signal,
      onProgress: (fraction) => setProgress(fraction * 15),
    });
    setProgress(15);
    if (pcm.length === 0) return { text: '', chunks: [] };

    const skippedSegments: SkippedSegment[] = [];
    const runLocal = async (resume: HfTranscribeCheckpoint | null): Promise<TranscriptResult> => {
      const prefixText = resume?.text ?? '';
      let stage: Stage | null = null;
      const enter = (next: Stage) => {
        if (stage === next) return;
        stage = next;
        onStage(next);
      };
      const local = await deps.localSession.run(pcm, {
        language: null,
        translate: false,
        startSegment: resume?.segments ?? 0,
        onModelProgress: resume
          ? undefined
          : (percent) => {
              enter('loading-model');
              setProgress(15 + percent * 0.65);
            },
        onTranscribeProgress: (percent) => {
          enter('transcribing-local');
          setProgress(resume ? 15 + percent * 0.85 : 80 + percent * 0.2);
        },
        onSegmentSkipped: (segment) => {
          skippedSegments.push(segment);
          onLog('warn', describeSkippedSegments(skippedSegments));
        },
      });
      if (!resume) return { text: local.text, chunks: local.chunks };
      return {
        text: joinTranscriptText([prefixText, local.text]),
        chunks: [...resume.chunks, ...local.chunks],
      };
    };

    let result: TranscriptResult;
    if (hfToken) {
      const hosted: { checkpoint: HfTranscribeCheckpoint | null } = { checkpoint: null };
      onStage('transcribing-hosted');
      try {
        result = await deps.transcribeHosted(pcm, {
          token: hfToken,
          onProgress: (percent) => setProgress(15 + percent * 0.85),
          onCheckpoint: (checkpoint) => {
            hosted.checkpoint = checkpoint;
          },
          signal,
        });
      } catch (hostedError) {
        if (signal.aborted) throw hostedError;
        const resume = hosted.checkpoint && hosted.checkpoint.segments > 0 ? hosted.checkpoint : null;
        onLog('warn', describeHostedFailure(hostedError, resume ? resume.segments * SEGMENT_SECONDS : 0));
        if (!resume) setProgress(15);
        result = await runLocal(resume);
      }
    } else {
      result = await runLocal(null);
    }

    if (!willPolish || !result.text.trim()) return result;

    onStage('polishing');
    let highestPolishProgress = 90;
    const onPolishProgress = (percent: number) => {
      highestPolishProgress = Math.max(highestPolishProgress, 90 + Math.round(percent * 0.1));
      onProgress(highestPolishProgress);
    };
    try {
      let text: string;
      if (hfToken) {
        try {
          text = await deps.polishHf(result.text, { token: hfToken, onProgress: onPolishProgress, signal });
        } catch (hfPolishError) {
          if (signal.aborted || !openRouterToken) throw hfPolishError;
          onLog('warn', 'Hugging Face AI cleanup failed - retrying with OpenRouter');
          text = await deps.polishOpenRouter(result.text, { token: openRouterToken, onProgress: onPolishProgress, signal });
        }
      } else {
        text = await deps.polishOpenRouter(result.text, { token: openRouterToken, onProgress: onPolishProgress, signal });
      }
      return { text, chunks: result.chunks };
    } catch (polishError) {
      if (signal.aborted) throw polishError;
      const provider = hfToken && !openRouterToken ? 'huggingface' : 'openrouter';
      const prefix = hfToken && openRouterToken ? 'Hugging Face and OpenRouter cleanup failed. ' : '';
      onLog('warn', `${prefix}${describePolishFailure(polishError, provider)}`);
      return result;
    }
  } finally {
    signal.removeEventListener('abort', cancelLocal);
  }
}
