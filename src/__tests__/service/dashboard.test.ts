/** @jest-environment node */
import type { CurrentJob, Snapshot } from '../../../service/controller';
import { formatBytes, formatElapsed, progressBar, renderFrame } from '../../../service/dashboard';
import type { ResourceSample } from '../../../service/resources';

const resources: ResourceSample = {
  cpuPercent: 34,
  memUsedBytes: 5 * 1024 ** 3,
  memTotalBytes: 16 * 1024 ** 3,
  serviceRssBytes: 1.5 * 1024 ** 3,
  diskFreeBytes: 120 * 1024 ** 3,
  diskTotalBytes: 500 * 1024 ** 3,
};
const info = { watchDir: '/in', outputDir: '/out', engine: 'on-device only (no HF_TOKEN) | polish: off' };
const job: CurrentJob = {
  name: 'meeting.mp4',
  path: '/in/meeting.mp4',
  size: 212 * 1024 * 1024,
  stage: 'transcribing-hosted',
  percent: 52,
  startedAt: 0,
  paused: false,
  pausedMs: 0,
  pausedSince: null,
};
const idle: Snapshot = {
  state: 'watching',
  watching: true,
  current: null,
  counts: { waiting: 0, ignored: 0, done: 0, failed: 0, cancelled: 0 },
  log: [],
};
const busy: Snapshot = {
  ...idle,
  state: 'processing',
  current: job,
  log: [{ at: 0, kind: 'error', message: 'b.mp4: ffmpeg failed' }],
};

describe('formatting helpers', () => {
  it('formats bytes in binary units', () => {
    expect(formatBytes(0)).toBe('0 B');
    expect(formatBytes(1536)).toBe('1.5 KB');
    expect(formatBytes(212 * 1024 * 1024)).toBe('212 MB');
  });

  it('formats elapsed time', () => {
    expect(formatElapsed(252_000)).toBe('04:12');
    expect(formatElapsed(3_723_000)).toBe('1:02:03');
    expect(formatElapsed(-5)).toBe('00:00');
  });

  it('draws a bar of 24 cells', () => {
    expect(progressBar(50)).toBe(`[${'#'.repeat(12)}${'.'.repeat(12)}]  50 %`);
    expect(progressBar(0)).toBe(`[${'.'.repeat(24)}]   0 %`);
    expect(progressBar(150)).toBe(`[${'#'.repeat(24)}] 100 %`);
  });
});

describe('renderFrame', () => {
  it('keeps the same height idle and busy so redraws do not drift', () => {
    expect(renderFrame(idle, info, resources, 0, 120)).toHaveLength(renderFrame(busy, info, resources, 0, 120).length);
  });

  it('shows state, current file, stage, progress, resources, log and hotkeys', () => {
    const text = renderFrame(busy, info, resources, 252_000, 200).join('\n');
    expect(text).toContain('[PROCESSING]');
    expect(text).toContain('meeting.mp4 (212 MB)');
    expect(text).toContain('Transcribing (hosted)');
    expect(text).toContain('52 %');
    expect(text).toContain('elapsed 04:12');
    expect(text).toContain('CPU 34 %');
    expect(text).toContain('RAM 5.0 GB / 16.0 GB');
    expect(text).toContain('Disk 120 GB free of 500 GB');
    expect(text).toContain('ERROR b.mp4: ffmpeg failed');
    expect(text).toContain('[space] pause/resume file  [c] cancel file  [p] pause watching  [s] start watching  [q] quit');
  });

  it('says watching is paused while the current file is still finishing', () => {
    const text = renderFrame({ ...busy, watching: false }, info, resources, 0, 200).join('\n');
    expect(text).toContain('[PROCESSING | watching paused]');
    expect(renderFrame({ ...idle, state: 'paused', watching: false }, info, resources, 0, 200).join('\n')).toContain('[PAUSED]');
  });

  it('marks a paused file and stops its elapsed clock', () => {
    const paused: Snapshot = {
      ...busy,
      current: { ...job, paused: true, pausedMs: 60_000, pausedSince: 200_000 },
    };
    const text = renderFrame(paused, info, resources, 500_000, 200).join('\n');
    expect(text).toContain('[PROCESSING | file paused]');
    expect(text).toContain('Stage : PAUSED - Transcribing (hosted)');
    expect(text).toContain('elapsed 02:20');
  });

  it('never exceeds the terminal width', () => {
    for (const line of renderFrame(busy, info, resources, 0, 40)) expect(line.length).toBeLessThanOrEqual(40);
  });

  it('shows n/a when the disk cannot be read', () => {
    const text = renderFrame(idle, info, { ...resources, diskFreeBytes: null, diskTotalBytes: null }, 0, 200).join('\n');
    expect(text).toContain('Disk n/a');
  });
});
