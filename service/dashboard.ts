import type { Snapshot, LogKind } from './controller';
import type { Stage } from './pipeline';
import type { ResourceSample } from './resources';

export interface DashboardInfo {
  watchDir: string;
  outputDir: string;
  engine: string;
}

const STAGE_LABEL: Record<Stage, string> = {
  extracting: 'Extracting audio',
  'transcribing-hosted': 'Transcribing (hosted)',
  'loading-model': 'Loading on-device model',
  'transcribing-local': 'Transcribing (on this machine)',
  polishing: 'Polishing text',
};

const STATE_LABEL: Record<Snapshot['state'], string> = {
  watching: 'WATCHING',
  paused: 'PAUSED',
  processing: 'PROCESSING',
  stopping: 'STOPPING',
};

const BAR_WIDTH = 24;
const LOG_LINES = 8;

export function formatBytes(bytes: number): string {
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value >= 100 || unit === 0 ? Math.round(value) : value.toFixed(1)} ${units[unit]}`;
}

export function formatElapsed(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const hours = Math.floor(total / 3600);
  const minutes = String(Math.floor((total % 3600) / 60)).padStart(2, '0');
  const seconds = String(total % 60).padStart(2, '0');
  return hours > 0 ? `${hours}:${minutes}:${seconds}` : `${minutes}:${seconds}`;
}

export function progressBar(percent: number, width = BAR_WIDTH): string {
  const clamped = Math.min(100, Math.max(0, percent));
  const filled = Math.round((clamped / 100) * width);
  return `[${'#'.repeat(filled)}${'.'.repeat(width - filled)}] ${String(Math.round(clamped)).padStart(3)} %`;
}

const clock = (at: number) => new Date(at).toTimeString().slice(0, 8);

const KIND_LABEL: Record<LogKind, string> = { info: 'INFO ', warn: 'WARN ', error: 'ERROR', done: 'DONE ' };

const fit = (line: string, width: number) => (line.length > width ? `${line.slice(0, Math.max(0, width - 1))}…` : line);

export function renderFrame(
  snapshot: Snapshot,
  info: DashboardInfo,
  resources: ResourceSample,
  now: number,
  width: number
): string[] {
  const { state, watching, current, counts, log } = snapshot;
  const flags = [current?.paused && 'file paused', current && !watching && 'watching paused'].filter(Boolean);
  const stateText = [STATE_LABEL[state], ...flags].join(' | ');

  const lines = [
    `VideoForge Watch  [${stateText}]`,
    `Watch : ${info.watchDir}`,
    `Output: ${info.outputDir}`,
    `Engine: ${info.engine}`,
    `Files : waiting ${counts.waiting} | done ${counts.done} | failed ${counts.failed} | cancelled ${counts.cancelled} | ignored ${counts.ignored}`,
    '',
  ];

  if (current) {
    const pausedNow = current.pausedSince != null ? now - current.pausedSince : 0;
    const elapsed = now - current.startedAt - current.pausedMs - pausedNow;
    lines.push(
      `Now   : ${current.name} (${formatBytes(current.size)})`,
      `Stage : ${current.paused ? 'PAUSED - ' : ''}${STAGE_LABEL[current.stage]}`,
      `${progressBar(current.percent)}   elapsed ${formatElapsed(elapsed)}`
    );
  } else {
    lines.push('Now   : idle', '', '');
  }

  const disk =
    resources.diskFreeBytes != null && resources.diskTotalBytes != null
      ? `${formatBytes(resources.diskFreeBytes)} free of ${formatBytes(resources.diskTotalBytes)} (output)`
      : 'n/a';
  lines.push(
    `CPU ${resources.cpuPercent} % | RAM ${formatBytes(resources.memUsedBytes)} / ${formatBytes(resources.memTotalBytes)} (service ${formatBytes(resources.serviceRssBytes)}) | Disk ${disk}`,
    '',
    `Log (last ${LOG_LINES})`
  );

  const recent = log.slice(-LOG_LINES);
  for (let i = 0; i < LOG_LINES; i++) {
    const entry = recent[i];
    lines.push(entry ? `${clock(entry.at)} ${KIND_LABEL[entry.kind]} ${entry.message}` : '');
  }
  lines.push('', '[space] pause/resume file  [c] cancel file  [p] pause watching  [s] start watching  [q] quit');

  return lines.map((line) => fit(line, width));
}

export function renderLogLine(kind: LogKind, message: string, at: number): string {
  return `${clock(at)} ${KIND_LABEL[kind]} ${message}`;
}
