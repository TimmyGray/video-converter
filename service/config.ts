import fs from 'node:fs';
import path from 'node:path';

export const MIN_VIDEO_BYTES = 5 * 1024 * 1024;
export const MAX_VIDEO_BYTES = 1024 * 1024 * 1024;
export const VIDEO_EXTENSIONS = ['.mp4', '.mkv', '.webm', '.mov', '.avi', '.m4v'];
export const POLL_INTERVAL_MS = 5_000;
export const STABLE_MS = 10_000;
export const LEDGER_FILE_NAME = '.videoforge-watch-state.json';
export const PARTIAL_SUFFIX = '.partial';

export interface ServiceConfig {
  watchDir: string;
  outputDir: string;
  hfToken: string;
  openRouterToken: string;
  ffmpegPath: string | null;
}

export type ConfigResult = { ok: true; config: ServiceConfig } | { ok: false; errors: string[] };

function checkDirectory(name: string, value: string | undefined, mode: number, modeLabel: string): string[] {
  const trimmed = value?.trim();
  if (!trimmed) return [`${name} is not set. Add it to .env as an absolute path.`];
  if (!path.isAbsolute(trimmed)) return [`${name} must be an absolute path, got "${trimmed}".`];

  let stat: fs.Stats;
  try {
    stat = fs.statSync(trimmed);
  } catch {
    return [`${name} does not exist: ${trimmed}`];
  }
  if (!stat.isDirectory()) return [`${name} is not a directory: ${trimmed}`];

  try {
    fs.accessSync(trimmed, mode);
  } catch {
    return [`${name} is not ${modeLabel} for this user: ${trimmed}`];
  }
  return [];
}

export function loadConfig(env: Record<string, string | undefined>): ConfigResult {
  const errors = [
    ...checkDirectory('WATCH_DIR', env.WATCH_DIR, fs.constants.R_OK, 'readable'),
    ...checkDirectory('OUTPUT_DIR', env.OUTPUT_DIR, fs.constants.W_OK, 'writable'),
  ];
  if (errors.length > 0) return { ok: false, errors };

  return {
    ok: true,
    config: {
      watchDir: path.resolve(env.WATCH_DIR!.trim()),
      outputDir: path.resolve(env.OUTPUT_DIR!.trim()),
      hfToken: env.HF_TOKEN?.trim() ?? '',
      openRouterToken: env.OPENROUTER_TOKEN?.trim() ?? '',
      ffmpegPath: env.FFMPEG_PATH?.trim() || null,
    },
  };
}
