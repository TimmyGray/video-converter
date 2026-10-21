import fs from 'node:fs';
import path from 'node:path';
import { DEFAULT_INSTANCE_PORT } from './singleInstance';

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
  /** Empty = use the built-in model ladder. */
  hfPolishModels: string[];
  openRouterPolishModels: string[];
  ffmpegPath: string | null;
  instancePort: number;
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

const MODEL_ID_PATTERN = /^[^\s/,]+\/\S+$/;

function parseModelList(name: string, value: string | undefined): { models: string[]; errors: string[] } {
  const entries = [...new Set((value ?? '').split(/[\s,]+/).filter(Boolean))];
  const invalid = entries.filter((entry) => !MODEL_ID_PATTERN.test(entry));
  return {
    models: invalid.length > 0 ? [] : entries,
    errors: invalid.map((entry) => `${name} has "${entry}", which is not a model id like org/model[:provider].`),
  };
}

function parsePort(value: string | undefined): { port: number; errors: string[] } {
  const trimmed = value?.trim();
  if (!trimmed) return { port: DEFAULT_INSTANCE_PORT, errors: [] };
  const port = Number(trimmed);
  const valid = /^\d+$/.test(trimmed) && port >= 1024 && port <= 65535;
  return {
    port: valid ? port : DEFAULT_INSTANCE_PORT,
    errors: valid ? [] : [`INSTANCE_PORT must be a whole number from 1024 to 65535, got "${trimmed}".`],
  };
}

export function loadConfig(env: Record<string, string | undefined>): ConfigResult {
  const instance = parsePort(env.INSTANCE_PORT);
  const hfModels = parseModelList('HF_POLISH_MODELS', env.HF_POLISH_MODELS);
  const openRouterModels = parseModelList('OPENROUTER_POLISH_MODELS', env.OPENROUTER_POLISH_MODELS);
  const errors = [
    ...checkDirectory('WATCH_DIR', env.WATCH_DIR, fs.constants.R_OK, 'readable'),
    ...checkDirectory('OUTPUT_DIR', env.OUTPUT_DIR, fs.constants.W_OK, 'writable'),
    ...hfModels.errors,
    ...openRouterModels.errors,
    ...instance.errors,
  ];
  if (errors.length > 0) return { ok: false, errors };

  return {
    ok: true,
    config: {
      watchDir: path.resolve(env.WATCH_DIR!.trim()),
      outputDir: path.resolve(env.OUTPUT_DIR!.trim()),
      hfToken: env.HF_TOKEN?.trim() ?? '',
      openRouterToken: env.OPENROUTER_TOKEN?.trim() ?? '',
      hfPolishModels: hfModels.models,
      openRouterPolishModels: openRouterModels.models,
      ffmpegPath: env.FFMPEG_PATH?.trim() || null,
      instancePort: instance.port,
    },
  };
}
