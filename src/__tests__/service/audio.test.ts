/** @jest-environment node */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import ffmpegStatic from 'ffmpeg-static';
import {
  extractPcm,
  parseDurationSeconds,
  parseProgressSeconds,
  parseWavToPcm16k,
} from '../../../service/audio';

describe('ffmpeg output parsing', () => {
  it('reads the input duration', () => {
    expect(parseDurationSeconds('  Duration: 01:02:03.50, start: 0.000000, bitrate: 128 kb/s')).toBeCloseTo(3723.5);
    expect(parseDurationSeconds('Stream #0:0: Audio')).toBeNull();
  });

  it('reads the decoded position and ignores N/A', () => {
    expect(parseProgressSeconds('size=  512kB time=00:00:30.00 bitrate=128.0kbits/s speed=60x')).toBe(30);
    expect(parseProgressSeconds('size=N/A time=N/A bitrate=N/A')).toBeNull();
  });
});

function chunk(id: string, body: Buffer): Buffer {
  const header = Buffer.alloc(8);
  header.write(id, 0, 'ascii');
  header.writeUInt32LE(body.length, 4);
  const pad = body.length % 2 === 1 ? Buffer.alloc(1) : Buffer.alloc(0);
  return Buffer.concat([header, body, pad]);
}

function wavFile(options: { samples: number[]; sampleRate?: number; channels?: number; extra?: Buffer[]; dataSize?: number }) {
  const fmt = Buffer.alloc(16);
  fmt.writeUInt16LE(1, 0);
  fmt.writeUInt16LE(options.channels ?? 1, 2);
  fmt.writeUInt32LE(options.sampleRate ?? 16000, 4);
  fmt.writeUInt16LE(16, 14);
  const data = Buffer.alloc(options.samples.length * 2);
  options.samples.forEach((sample, i) => data.writeInt16LE(sample, i * 2));
  const dataChunk = chunk('data', data);
  if (options.dataSize !== undefined) dataChunk.writeUInt32LE(options.dataSize, 4);
  const body = Buffer.concat([Buffer.from('WAVE'), chunk('fmt ', fmt), ...(options.extra ?? []), dataChunk]);
  const riff = Buffer.alloc(8);
  riff.write('RIFF', 0, 'ascii');
  riff.writeUInt32LE(body.length, 4);
  return Buffer.concat([riff, body]);
}

describe('parseWavToPcm16k', () => {
  let dir: string;
  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vf-wav-'));
  });
  afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

  const write = (name: string, bytes: Buffer) => {
    const file = path.join(dir, name);
    fs.writeFileSync(file, bytes);
    return file;
  };

  it('converts int16 samples to floats in [-1, 1)', async () => {
    const pcm = await parseWavToPcm16k(write('a.wav', wavFile({ samples: [0, 16384, -32768, 32767] })));
    expect(Array.from(pcm)).toEqual([0, 0.5, -1, 32767 / 32768]);
  });

  it('finds data after a LIST chunk with an odd size (pad byte)', async () => {
    const list = chunk('LIST', Buffer.from('INFOx'));
    const pcm = await parseWavToPcm16k(write('b.wav', wavFile({ samples: [16384, -16384], extra: [list] })));
    expect(Array.from(pcm)).toEqual([0.5, -0.5]);
  });

  it('returns an empty waveform for a WAV with no samples', async () => {
    expect((await parseWavToPcm16k(write('c.wav', wavFile({ samples: [] })))).length).toBe(0);
  });

  it('clamps a data size larger than the file', async () => {
    const pcm = await parseWavToPcm16k(write('d.wav', wavFile({ samples: [16384, 16384], dataSize: 0xffffffff })));
    expect(pcm.length).toBe(2);
  });

  it('reads waveforms longer than one read buffer', async () => {
    const count = (1 << 19) + 3;
    const pcm = await parseWavToPcm16k(write('e.wav', wavFile({ samples: new Array(count).fill(8192) })));
    expect(pcm.length).toBe(count);
    expect(pcm[count - 1]).toBe(0.25);
  });

  it('rejects anything that is not 16 kHz mono PCM', async () => {
    await expect(parseWavToPcm16k(write('f.wav', wavFile({ samples: [1], sampleRate: 44100 })))).rejects.toThrow(/16 kHz mono/);
    await expect(parseWavToPcm16k(write('g.wav', wavFile({ samples: [1], channels: 2 })))).rejects.toThrow(/16 kHz mono/);
    await expect(parseWavToPcm16k(write('h.wav', Buffer.from('not a wav file at all')))).rejects.toThrow(/not a WAV/);
  });
});

const ffmpeg = ffmpegStatic && fs.existsSync(ffmpegStatic) ? ffmpegStatic : null;

(ffmpeg ? describe : describe.skip)('extractPcm with the bundled ffmpeg', () => {
  let dir: string;
  beforeAll(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vf-ffmpeg-'));
  });
  afterAll(() => fs.rmSync(dir, { recursive: true, force: true }));

  const make = (name: string, args: string[]) => {
    const file = path.join(dir, name);
    const run = spawnSync(ffmpeg!, ['-y', '-hide_banner', '-loglevel', 'error', ...args, file]);
    expect(run.status).toBe(0);
    return file;
  };

  it('decodes a 2 second tone to 32000 samples of 16 kHz mono audio with progress', async () => {
    const input = make('tone.mkv', ['-f', 'lavfi', '-i', 'sine=frequency=440:duration=2']);
    const progress: number[] = [];
    const pcm = await extractPcm(ffmpeg!, input, { onProgress: (fraction) => progress.push(fraction) });
    expect(Math.abs(pcm.length - 32000)).toBeLessThan(1600);
    expect(Math.max(...pcm)).toBeGreaterThan(0.1);
    expect(progress.every((value) => value >= 0 && value <= 1)).toBe(true);
  });

  it('fails with a clear message when the video has no audio track', async () => {
    const input = make('silent.mkv', ['-f', 'lavfi', '-i', 'color=c=black:s=64x64:d=1']);
    await expect(extractPcm(ffmpeg!, input)).rejects.toThrow('The video has no audio track.');
  });

  it('stops when the signal is already aborted', async () => {
    const input = make('tone2.mkv', ['-f', 'lavfi', '-i', 'sine=frequency=440:duration=1']);
    await expect(extractPcm(ffmpeg!, input, { signal: AbortSignal.abort() })).rejects.toMatchObject({ name: 'AbortError' });
  });

  it('reports a missing binary', async () => {
    await expect(extractPcm(path.join(dir, 'no-ffmpeg'), path.join(dir, 'x.mkv'))).rejects.toThrow(/Could not start ffmpeg/);
  });
});
