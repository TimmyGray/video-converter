import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { getWavNormalizeCommand } from '@/hooks/ffmpegCommandPlanner';
import { SAMPLE_RATE } from '@/utils/transcriptionSegments';
import type { PauseGate } from './pauseGate';
import { suspendProcess } from './processSignal';

const CLOCK = String.raw`(\d+):(\d+):(\d+(?:\.\d+)?)`;
const DURATION_PATTERN = new RegExp(`Duration:\\s*${CLOCK}`);
const NO_STREAM_PATTERN = /does not contain any stream/;
const TIME_PATTERN = new RegExp(`time=\\s*${CLOCK}`);

function clockToSeconds(match: RegExpMatchArray): number {
  return Number(match[1]) * 3600 + Number(match[2]) * 60 + Number(match[3]);
}

export function parseDurationSeconds(line: string): number | null {
  const match = line.match(DURATION_PATTERN);
  return match ? clockToSeconds(match) : null;
}

export function parseProgressSeconds(line: string): number | null {
  const match = line.match(TIME_PATTERN);
  return match ? clockToSeconds(match) : null;
}

function abortError(): DOMException {
  return new DOMException('Audio extraction was stopped.', 'AbortError');
}

interface ExtractOptions {
  signal?: AbortSignal;
  gate?: PauseGate;
  onProgress?: (fraction: number) => void;
}

function runFfmpeg(ffmpegPath: string, input: string, wavPath: string, options: ExtractOptions): Promise<void> {
  return new Promise((resolve, reject) => {
    if (options.signal?.aborted) {
      reject(abortError());
      return;
    }

    const child = spawn(
      ffmpegPath,
      ['-nostdin', '-y', '-hide_banner', ...getWavNormalizeCommand(input, wavPath)],
      { stdio: ['ignore', 'ignore', 'pipe'] }
    );

    let duration: number | null = null;
    let lastLine = '';
    let buffered = '';
    let noAudio = false;

    const onAbort = () => child.kill('SIGKILL');
    options.signal?.addEventListener('abort', onAbort, { once: true });

    const applyPause = (paused: boolean) => suspendProcess(child, paused);
    const stopWatchingGate = options.gate?.onChange(applyPause);
    if (options.gate?.paused) applyPause(true);
    const detach = () => {
      options.signal?.removeEventListener('abort', onAbort);
      stopWatchingGate?.();
    };

    const handleLine = (line: string) => {
      const text = line.trim();
      if (!text) return;
      lastLine = text;
      if (NO_STREAM_PATTERN.test(text)) noAudio = true;
      duration ??= parseDurationSeconds(text);
      const seconds = parseProgressSeconds(text);
      if (seconds != null && duration) options.onProgress?.(Math.min(1, seconds / duration));
    };

    child.stderr.setEncoding('utf8');
    child.stderr.on('data', (chunk: string) => {
      const parts = (buffered + chunk).split(/[\r\n]/);
      buffered = parts.pop() ?? '';
      parts.forEach(handleLine);
    });

    child.on('error', (err) => {
      detach();
      reject(new Error(`Could not start ffmpeg (${ffmpegPath}): ${err.message}`));
    });

    child.on('close', (code) => {
      detach();
      handleLine(buffered);
      if (options.signal?.aborted) reject(abortError());
      else if (code === 0) resolve();
      else if (noAudio) reject(new Error('The video has no audio track.'));
      else reject(new Error(`ffmpeg failed (exit ${code}): ${lastLine || 'no output'}`));
    });
  });
}

const READ_CHUNK_BYTES = 1 << 20;

/**
 * Reads a 16-bit PCM mono WAV into floats. Walks the RIFF chunks instead of assuming a 44-byte
 * header, since ffmpeg may put a LIST chunk before `data`.
 */
export async function parseWavToPcm16k(file: string): Promise<Float32Array> {
  const handle = await fs.open(file, 'r');
  try {
    const { size: fileSize } = await handle.stat();
    const header = Buffer.alloc(12);
    await handle.read(header, 0, 12, 0);
    if (header.toString('ascii', 0, 4) !== 'RIFF' || header.toString('ascii', 8, 12) !== 'WAVE') {
      throw new Error('ffmpeg produced a file that is not a WAV.');
    }

    let position = 12;
    let format: { channels: number; sampleRate: number; bits: number } | null = null;
    const chunkHeader = Buffer.alloc(8);

    while (position + 8 <= fileSize) {
      await handle.read(chunkHeader, 0, 8, position);
      const id = chunkHeader.toString('ascii', 0, 4);
      const declared = chunkHeader.readUInt32LE(4);
      const bodyStart = position + 8;

      if (id === 'fmt ') {
        const body = Buffer.alloc(16);
        await handle.read(body, 0, 16, bodyStart);
        format = { channels: body.readUInt16LE(2), sampleRate: body.readUInt32LE(4), bits: body.readUInt16LE(14) };
      } else if (id === 'data') {
        if (!format || format.channels !== 1 || format.sampleRate !== SAMPLE_RATE || format.bits !== 16) {
          throw new Error('ffmpeg produced a WAV that is not 16 kHz mono 16-bit PCM.');
        }
        const dataBytes = Math.min(declared, fileSize - bodyStart);
        const samples = Math.floor(dataBytes / 2);
        const pcm = new Float32Array(samples);
        const buffer = Buffer.alloc(READ_CHUNK_BYTES);
        let filled = 0;
        while (filled < samples) {
          const wanted = Math.min(READ_CHUNK_BYTES, (samples - filled) * 2);
          const { bytesRead } = await handle.read(buffer, 0, wanted, bodyStart + filled * 2);
          if (bytesRead < 2) break;
          const count = Math.floor(bytesRead / 2);
          for (let i = 0; i < count; i++) pcm[filled + i] = buffer.readInt16LE(i * 2) / 32768;
          filled += count;
        }
        return filled === samples ? pcm : pcm.subarray(0, filled);
      }

      position = bodyStart + declared + (declared % 2);
    }
    throw new Error('ffmpeg produced a WAV without audio data.');
  } finally {
    await handle.close();
  }
}

export async function extractPcm(ffmpegPath: string, input: string, options: ExtractOptions = {}): Promise<Float32Array> {
  await options.gate?.waitIfPaused(options.signal);
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'videoforge-watch-'));
  try {
    const wavPath = path.join(tempDir, 'audio.wav');
    await runFfmpeg(ffmpegPath, input, wavPath, options);
    return await parseWavToPcm16k(wavPath);
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
}
