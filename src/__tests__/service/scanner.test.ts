/** @jest-environment node */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { STABLE_MS } from '../../../service/config';
import type { FileIdentity, Ledger } from '../../../service/ledger';
import {
  classifyScan,
  createStabilityTracker,
  isSizeInRange,
  isVideoName,
  listVideos,
} from '../../../service/scanner';

const MIB = 1024 * 1024;
const GIB = 1024 * MIB;

const video = (name: string, size: number, mtimeMs: number): FileIdentity => ({ path: `/in/${name}`, size, mtimeMs });
const ledgerWith = (processed: FileIdentity[]): Ledger => ({
  isProcessed: (id) => processed.some((p) => p.path === id.path && p.size === id.size && p.mtimeMs === id.mtimeMs),
  record: () => undefined,
  counts: () => ({ done: 0, failed: 0, cancelled: 0 }),
});

describe('isSizeInRange', () => {
  it('requires strictly more than 5 MiB and strictly less than 1 GiB', () => {
    expect(isSizeInRange(5 * MIB)).toBe(false);
    expect(isSizeInRange(5 * MIB + 1)).toBe(true);
    expect(isSizeInRange(GIB - 1)).toBe(true);
    expect(isSizeInRange(GIB)).toBe(false);
  });
});

describe('isVideoName', () => {
  it('matches the supported extensions case-insensitively', () => {
    for (const name of ['a.mp4', 'a.MKV', 'a.webm', 'a.Mov', 'a.avi', 'a.m4v']) expect(isVideoName(name)).toBe(true);
    for (const name of ['a.txt', 'a.mp4.partial', 'mp4', 'a.wav']) expect(isVideoName(name)).toBe(false);
  });
});

describe('createStabilityTracker', () => {
  it('releases a file only after it stayed unchanged for the stability window', () => {
    const tracker = createStabilityTracker(STABLE_MS);
    const file = video('a.mp4', 6 * MIB, 1);
    expect(tracker.stable([file], 0)).toEqual([]);
    expect(tracker.stable([file], STABLE_MS - 1)).toEqual([]);
    expect(tracker.stable([file], STABLE_MS)).toEqual([file]);
  });

  it('restarts the window when the file grows', () => {
    const tracker = createStabilityTracker(STABLE_MS);
    tracker.stable([video('a.mp4', 6 * MIB, 1)], 0);
    const grown = video('a.mp4', 7 * MIB, 2);
    expect(tracker.stable([grown], STABLE_MS)).toEqual([]);
    expect(tracker.stable([grown], STABLE_MS * 2)).toEqual([grown]);
  });

  it('forgets files that disappeared', () => {
    const tracker = createStabilityTracker(STABLE_MS);
    const file = video('a.mp4', 6 * MIB, 1);
    tracker.stable([file], 0);
    tracker.stable([], 5_000);
    expect(tracker.stable([file], STABLE_MS)).toEqual([]);
  });
});

describe('classifyScan', () => {
  const settled = () => ({ stable: (files: FileIdentity[]) => files });

  it('picks the oldest eligible file and counts the rest as waiting', () => {
    const newer = video('new.mp4', 6 * MIB, 200);
    const older = video('old.mp4', 6 * MIB, 100);
    const result = classifyScan([newer, older], ledgerWith([]), settled(), 0);
    expect(result.next).toBe(older);
    expect(result.waiting).toBe(1);
  });

  it('skips processed files and reports out-of-range files as ignored', () => {
    const done = video('done.mp4', 6 * MIB, 1);
    const small = video('small.mp4', 3 * MIB, 2);
    const huge = video('huge.mp4', GIB, 3);
    const result = classifyScan([done, small, huge], ledgerWith([done]), settled(), 0);
    expect(result.next).toBeNull();
    expect(result.ignored).toEqual([small, huge]);
    expect(result.waiting).toBe(0);
  });

  it('treats a processed path with a new size as a new file', () => {
    const before = video('a.mp4', 6 * MIB, 1);
    const after = video('a.mp4', 8 * MIB, 5);
    expect(classifyScan([after], ledgerWith([before]), settled(), 0).next).toBe(after);
  });

  it('waits for stability before releasing a file', () => {
    const tracker = createStabilityTracker(STABLE_MS);
    const file = video('a.mp4', 6 * MIB, 1);
    expect(classifyScan([file], ledgerWith([]), tracker, 0)).toMatchObject({ next: null, waiting: 1 });
    expect(classifyScan([file], ledgerWith([]), tracker, STABLE_MS).next).toBe(file);
  });
});

describe('listVideos', () => {
  it('lists only top-level video files with their size and mtime', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vf-scan-'));
    try {
      fs.writeFileSync(path.join(dir, 'a.mp4'), Buffer.alloc(10));
      fs.writeFileSync(path.join(dir, 'notes.txt'), 'x');
      fs.mkdirSync(path.join(dir, 'sub.mp4'));
      fs.mkdirSync(path.join(dir, 'nested'));
      fs.writeFileSync(path.join(dir, 'nested', 'b.mp4'), Buffer.alloc(10));

      const found = await listVideos(dir);
      expect(found).toHaveLength(1);
      expect(found[0]).toMatchObject({ path: path.join(dir, 'a.mp4'), size: 10 });
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});
