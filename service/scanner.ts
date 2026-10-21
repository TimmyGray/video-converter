import fs from 'node:fs/promises';
import path from 'node:path';
import { MAX_VIDEO_BYTES, MIN_VIDEO_BYTES, VIDEO_EXTENSIONS } from './config';
import type { FileIdentity, Ledger } from './ledger';

export function isVideoName(name: string): boolean {
  return VIDEO_EXTENSIONS.includes(path.extname(name).toLowerCase());
}

export function isSizeInRange(size: number): boolean {
  return size > MIN_VIDEO_BYTES && size < MAX_VIDEO_BYTES;
}

export async function listVideos(dir: string): Promise<FileIdentity[]> {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const found: FileIdentity[] = [];
  for (const entry of entries) {
    if (!entry.isFile() || !isVideoName(entry.name)) continue;
    const full = path.join(dir, entry.name);
    try {
      const stat = await fs.stat(full);
      found.push({ path: full, size: stat.size, mtimeMs: stat.mtimeMs });
    } catch {
      continue;
    }
  }
  return found;
}

export interface StabilityTracker {
  stable: (files: FileIdentity[], now: number) => FileIdentity[];
}

export function createStabilityTracker(stableMs: number): StabilityTracker {
  const seen = new Map<string, { size: number; mtimeMs: number; since: number }>();

  return {
    stable: (files, now) => {
      const current = new Set(files.map((file) => file.path));
      for (const known of seen.keys()) if (!current.has(known)) seen.delete(known);

      return files.filter((file) => {
        const previous = seen.get(file.path);
        if (!previous || previous.size !== file.size || previous.mtimeMs !== file.mtimeMs) {
          seen.set(file.path, { size: file.size, mtimeMs: file.mtimeMs, since: now });
          return false;
        }
        return now - previous.since >= stableMs;
      });
    },
  };
}

export interface ScanResult {
  next: FileIdentity | null;
  waiting: number;
  ignored: FileIdentity[];
}

export function classifyScan(
  files: FileIdentity[],
  ledger: Ledger,
  tracker: StabilityTracker,
  now: number
): ScanResult {
  const ignored = files.filter((file) => !isSizeInRange(file.size));
  const fresh = files.filter((file) => isSizeInRange(file.size) && !ledger.isProcessed(file));
  const stable = tracker.stable(fresh, now);
  const ready = [...stable].sort((a, b) => a.mtimeMs - b.mtimeMs);
  return { next: ready[0] ?? null, waiting: fresh.length - (ready.length > 0 ? 1 : 0), ignored };
}
