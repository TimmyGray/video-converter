import { TranscriptChunk, TranscriptFormat } from '@/types';

/**
 * Formats a time in seconds as a subtitle timestamp.
 * SRT uses a comma before milliseconds (HH:MM:SS,mmm); VTT uses a dot (HH:MM:SS.mmm).
 */
export function formatTimestamp(seconds: number, msSeparator: ',' | '.'): string {
  const safeSeconds = Number.isFinite(seconds) && seconds > 0 ? seconds : 0;
  const totalMs = Math.round(safeSeconds * 1000);

  const hours = Math.floor(totalMs / 3_600_000);
  const minutes = Math.floor((totalMs % 3_600_000) / 60_000);
  const secs = Math.floor((totalMs % 60_000) / 1000);
  const millis = totalMs % 1000;

  const pad = (value: number, size = 2) => String(value).padStart(size, '0');
  return `${pad(hours)}:${pad(minutes)}:${pad(secs)}${msSeparator}${pad(millis, 3)}`;
}

/**
 * Resolves a chunk's [start, end] window, filling a missing/invalid end from the
 * next chunk's start (or a small default) so subtitle cues always have a duration.
 */
function resolveWindow(
  chunk: TranscriptChunk,
  nextChunk: TranscriptChunk | undefined
): { start: number; end: number } {
  const [rawStart, rawEnd] = chunk.timestamp;
  const start = Number.isFinite(rawStart) && rawStart > 0 ? rawStart : 0;

  let end = typeof rawEnd === 'number' && Number.isFinite(rawEnd) ? rawEnd : NaN;
  if (!Number.isFinite(end) || end <= start) {
    const nextStart = nextChunk?.timestamp?.[0];
    end = typeof nextStart === 'number' && Number.isFinite(nextStart) && nextStart > start
      ? nextStart
      : start + 2;
  }

  return { start, end };
}

/** Serializes transcript chunks to SubRip (.srt) format. */
export function chunksToSrt(chunks: TranscriptChunk[]): string {
  return chunks
    .map((chunk, index) => {
      const { start, end } = resolveWindow(chunk, chunks[index + 1]);
      const text = chunk.text.trim();
      return `${index + 1}\n${formatTimestamp(start, ',')} --> ${formatTimestamp(end, ',')}\n${text}`;
    })
    .join('\n\n')
    .concat('\n');
}

/** Serializes transcript chunks to WebVTT (.vtt) format. */
export function chunksToVtt(chunks: TranscriptChunk[]): string {
  const cues = chunks
    .map((chunk, index) => {
      const { start, end } = resolveWindow(chunk, chunks[index + 1]);
      const text = chunk.text.trim();
      return `${formatTimestamp(start, '.')} --> ${formatTimestamp(end, '.')}\n${text}`;
    })
    .join('\n\n');

  return `WEBVTT\n\n${cues}\n`;
}

/**
 * Serializes a transcript to the requested output format.
 * `txt` returns the plain text; `srt`/`vtt` build timestamped cues from chunks.
 */
export function serializeTranscript(
  format: TranscriptFormat,
  text: string,
  chunks: TranscriptChunk[]
): string {
  if (format === 'srt') return chunksToSrt(chunks);
  if (format === 'vtt') return chunksToVtt(chunks);
  return `${text.trim()}\n`;
}
