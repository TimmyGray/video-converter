/** @jest-environment node */
import type { TranscriptChunk } from '@/types';
import { HfPolishError } from '@/utils/hfPolish';
import { HfTranscribeError } from '@/utils/hfTranscribe';
import { createPauseGate, type PauseGate } from '../../../service/pauseGate';
import { transcribeVideo, type PipelineCallbacks, type PipelineDeps, type Stage } from '../../../service/pipeline';

const chunk = (text: string, start: number): TranscriptChunk => ({ text, timestamp: [start, start + 1] });
const THREE_MINUTES = new Float32Array(16000 * 180);

interface Harness {
  deps: PipelineDeps;
  callbacks: PipelineCallbacks;
  stages: Stage[];
  progress: number[];
  logs: Array<{ level: string; message: string }>;
  controller: AbortController;
  gate: PauseGate;
  setPaused: jest.Mock;
  hosted: jest.Mock;
  localRun: jest.Mock;
  localCancel: jest.Mock;
  polishHf: jest.Mock;
  polishOpenRouter: jest.Mock;
  extract: jest.Mock;
}

function harness(overrides: Partial<PipelineDeps> = {}): Harness {
  const controller = new AbortController();
  const stages: Stage[] = [];
  const progress: number[] = [];
  const logs: Array<{ level: string; message: string }> = [];
  const extract = jest.fn(async () => THREE_MINUTES);
  const hosted = jest.fn();
  const localRun = jest.fn(async () => ({ text: 'local text', chunks: [chunk('local text', 0)], language: 'en', skippedSegments: [] }));
  const localCancel = jest.fn();
  const setPaused = jest.fn();
  const gate = createPauseGate();
  const polishHf = jest.fn(async (text: string) => `${text} (hf)`);
  const polishOpenRouter = jest.fn(async (text: string) => `${text} (or)`);
  return {
    deps: {
      hfToken: '',
      openRouterToken: '',
      extractPcm: extract,
      transcribeHosted: hosted,
      localSession: { run: localRun, cancel: localCancel, setPaused },
      polishHf: polishHf as unknown as PipelineDeps['polishHf'],
      polishOpenRouter: polishOpenRouter as unknown as PipelineDeps['polishOpenRouter'],
      ...overrides,
    },
    callbacks: {
      signal: controller.signal,
      gate,
      onStage: (stage) => stages.push(stage),
      onProgress: (percent) => progress.push(percent),
      onLog: (level, message) => logs.push({ level, message }),
    },
    stages,
    progress,
    logs,
    controller,
    gate,
    setPaused,
    hosted,
    localRun,
    localCancel,
    polishHf,
    polishOpenRouter,
    extract,
  };
}

describe('transcribeVideo without tokens', () => {
  it('extracts audio and transcribes on this machine only', async () => {
    const h = harness();
    const result = await transcribeVideo('/in/a.mp4', h.deps, h.callbacks);
    expect(result).toEqual({ text: 'local text', chunks: [chunk('local text', 0)] });
    expect(h.hosted).not.toHaveBeenCalled();
    expect(h.polishHf).not.toHaveBeenCalled();
    expect(h.polishOpenRouter).not.toHaveBeenCalled();
    expect(h.stages[0]).toBe('extracting');
    expect(h.localRun).toHaveBeenCalledWith(
      THREE_MINUTES,
      expect.objectContaining({ language: null, translate: false, startSegment: 0 })
    );
  });

  it('returns an empty transcript without calling any engine when the audio is empty', async () => {
    const h = harness({ hfToken: 'hf' });
    h.extract.mockResolvedValue(new Float32Array(0));
    expect(await transcribeVideo('/in/a.mp4', h.deps, h.callbacks)).toEqual({ text: '', chunks: [] });
    expect(h.hosted).not.toHaveBeenCalled();
    expect(h.localRun).not.toHaveBeenCalled();
  });

  it('maps local model loading and decoding onto the 15–100 % span and logs skipped stretches', async () => {
    const h = harness();
    h.localRun.mockImplementation(async (_pcm, options) => {
      options.onModelProgress(100);
      options.onTranscribeProgress(50);
      options.onSegmentSkipped({ index: 1, startSeconds: 60, endSeconds: 120, reason: 'stalled' });
      return { text: 't', chunks: [], language: 'en', skippedSegments: [] };
    });
    await transcribeVideo('/in/a.mp4', h.deps, h.callbacks);
    expect(h.stages).toEqual(['extracting', 'loading-model', 'transcribing-local']);
    expect(h.progress).toContain(80);
    expect(h.progress).toContain(90);
    expect(h.logs.find((log) => log.level === 'warn')?.message).toContain('skipped');
  });
});

describe('transcribeVideo with a Hugging Face token', () => {
  it('uses the hosted engine and polishes the result, scaling progress to 90 %', async () => {
    const h = harness({ hfToken: 'hf' });
    h.hosted.mockImplementation(async (_pcm, options) => {
      options.onProgress(100);
      return { text: 'hosted text', chunks: [chunk('hosted text', 0)] };
    });
    const result = await transcribeVideo('/in/a.mp4', h.deps, h.callbacks);
    expect(result.text).toBe('hosted text (hf)');
    expect(result.chunks).toEqual([chunk('hosted text', 0)]);
    expect(h.localRun).not.toHaveBeenCalled();
    expect(h.stages).toEqual(['extracting', 'transcribing-hosted', 'polishing']);
    expect(Math.max(...h.progress)).toBe(90);
  });

  it('resumes locally after the last finished hosted segment and joins text and chunks', async () => {
    const h = harness({ hfToken: 'hf' });
    h.hosted.mockImplementation(async (_pcm, options) => {
      options.onCheckpoint({ segments: 2, text: 'A B', chunks: [chunk('A B', 0)] });
      throw new HfTranscribeError('HF down', 503);
    });
    h.localRun.mockResolvedValue({ text: 'C', chunks: [chunk('C', 120)], language: 'en', skippedSegments: [] });
    const result = await transcribeVideo('/in/a.mp4', h.deps, h.callbacks);

    expect(h.localRun).toHaveBeenCalledWith(THREE_MINUTES, expect.objectContaining({ startSegment: 2 }));
    expect(result.text).toBe('A B C (hf)');
    expect(result.chunks).toEqual([chunk('A B', 0), chunk('C', 120)]);
    const warning = h.logs.find((log) => log.message.startsWith('Hosted transcription failed'));
    expect(warning?.message).toMatch(/HTTP 503/);
    expect(warning?.message).toMatch(/kept the first 0?2:00/);
    expect(warning?.message).not.toMatch(/above/);
  });

  it('starts the local run from the beginning when the hosted engine fails before any segment', async () => {
    const h = harness({ hfToken: 'hf' });
    h.hosted.mockRejectedValue(new TypeError('fetch failed'));
    await transcribeVideo('/in/a.mp4', h.deps, h.callbacks);
    expect(h.localRun).toHaveBeenCalledWith(THREE_MINUTES, expect.objectContaining({ startSegment: 0 }));
    expect(h.logs[0].message).toBe('Hosted transcription failed (network error) - continuing on this machine');
  });

  it('keeps the raw text when polishing fails', async () => {
    const h = harness({ hfToken: 'hf' });
    h.hosted.mockResolvedValue({ text: 'raw', chunks: [] });
    h.polishHf.mockRejectedValue(new HfPolishError('down', 503));
    const result = await transcribeVideo('/in/a.mp4', h.deps, h.callbacks);
    expect(result.text).toBe('raw');
    const warning = h.logs.find((log) => log.message.includes('left unpolished'));
    expect(warning?.message).toMatch(/Details: down$/);
  });

  it('retries polishing with OpenRouter when both tokens are set and Hugging Face fails', async () => {
    const h = harness({ hfToken: 'hf', openRouterToken: 'or' });
    h.hosted.mockResolvedValue({ text: 'raw', chunks: [] });
    h.polishHf.mockRejectedValue(new HfPolishError('down', 503));
    const result = await transcribeVideo('/in/a.mp4', h.deps, h.callbacks);
    expect(result.text).toBe('raw (or)');
  });
});

describe('transcribeVideo polish models', () => {
  it('passes the configured model lists to each provider', async () => {
    const h = harness({
      hfToken: 'hf',
      openRouterToken: 'or',
      hfPolishModels: ['org/hf-model:provider'],
      openRouterPolishModels: ['vendor/or-model:free'],
    });
    h.hosted.mockResolvedValue({ text: 'raw', chunks: [] });
    h.polishHf.mockRejectedValue(new HfPolishError('down', 503));
    await transcribeVideo('/in/a.mp4', h.deps, h.callbacks);
    expect(h.polishHf).toHaveBeenCalledWith('raw', expect.objectContaining({ models: ['org/hf-model:provider'] }));
    expect(h.polishOpenRouter).toHaveBeenCalledWith('raw', expect.objectContaining({ models: ['vendor/or-model:free'] }));
  });
});

describe('transcribeVideo pausing', () => {
  it('hands the gate to audio extraction', async () => {
    const h = harness();
    await transcribeVideo('/in/a.mp4', h.deps, h.callbacks);
    expect(h.extract).toHaveBeenCalledWith('/in/a.mp4', expect.objectContaining({ gate: h.gate }));
  });

  it('holds the next hosted request while paused and sends it after resume', async () => {
    const fetchImpl = jest.fn(async () => new Response('{}'));
    const h = harness({ hfToken: 'hf', fetchImpl: fetchImpl as unknown as typeof fetch });
    let release: () => void = () => undefined;
    h.hosted.mockImplementation(async (_pcm, options) => {
      h.gate.pause();
      const request = options.fetchImpl!('https://example.test/slice');
      await new Promise<void>((resolve) => {
        release = resolve;
      });
      expect(fetchImpl).not.toHaveBeenCalled();
      h.gate.resume();
      await request;
      return { text: 'hosted', chunks: [] };
    });
    const run = transcribeVideo('/in/a.mp4', h.deps, h.callbacks);
    await new Promise((resolve) => setTimeout(resolve, 10));
    release();
    await run;
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('freezes the local engine while paused and thaws it afterwards', async () => {
    const h = harness();
    h.localRun.mockImplementation(async () => {
      h.gate.pause();
      h.gate.resume();
      return { text: 'x', chunks: [], language: 'en', skippedSegments: [] };
    });
    await transcribeVideo('/in/a.mp4', h.deps, h.callbacks);
    expect(h.setPaused.mock.calls).toEqual([[true], [false], [false]]);
  });

  it('does not start the local run until a paused job is resumed', async () => {
    const h = harness();
    h.gate.pause();
    h.extract.mockImplementation(async () => THREE_MINUTES);
    const run = transcribeVideo('/in/a.mp4', h.deps, h.callbacks);
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(h.localRun).not.toHaveBeenCalled();
    h.gate.resume();
    await run;
    expect(h.localRun).toHaveBeenCalledTimes(1);
  });

  it('thaws the engine when the job ends while paused', async () => {
    const h = harness();
    h.extract.mockRejectedValue(new DOMException('stopped', 'AbortError'));
    h.gate.pause();
    await expect(transcribeVideo('/in/a.mp4', h.deps, h.callbacks)).rejects.toBeDefined();
    expect(h.setPaused).toHaveBeenLastCalledWith(false);
  });
});

describe('transcribeVideo with only an OpenRouter token', () => {
  it('transcribes locally and polishes through OpenRouter alone', async () => {
    const h = harness({ openRouterToken: 'or' });
    const result = await transcribeVideo('/in/a.mp4', h.deps, h.callbacks);
    expect(h.hosted).not.toHaveBeenCalled();
    expect(h.polishHf).not.toHaveBeenCalled();
    expect(result.text).toBe('local text (or)');
  });
});

describe('transcribeVideo cancellation', () => {
  it('cancels the local session when the signal aborts and does not fall back after a hosted abort', async () => {
    const h = harness({ hfToken: 'hf' });
    h.hosted.mockImplementation(async () => {
      h.controller.abort();
      throw new DOMException('aborted', 'AbortError');
    });
    await expect(transcribeVideo('/in/a.mp4', h.deps, h.callbacks)).rejects.toMatchObject({ name: 'AbortError' });
    expect(h.localCancel).toHaveBeenCalled();
    expect(h.localRun).not.toHaveBeenCalled();
  });

  it('propagates an abort during audio extraction', async () => {
    const h = harness();
    h.extract.mockRejectedValue(new DOMException('stopped', 'AbortError'));
    await expect(transcribeVideo('/in/a.mp4', h.deps, h.callbacks)).rejects.toMatchObject({ name: 'AbortError' });
  });
});
