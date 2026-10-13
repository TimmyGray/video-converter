import { getCommandAttempts, getTrimInputArgs, getWavNormalizeCommand } from '@/hooks/ffmpegCommandPlanner';
import { VideoFormat } from '@/types';

const VIDEO_FORMATS: VideoFormat[] = ['mp4', 'avi', 'mov', 'mkv', 'webm', 'gif'];

describe('getCommandAttempts - audio extraction (mp3)', () => {
  it('emits a single deterministic audio-only profile with -vn and 128k VBR mp3', () => {
    const attempts = getCommandAttempts('clip.mov', 'clip.mov', 'mp3', 'clip_audio.mp3', null);

    expect(attempts).toEqual([
      [
        '-i',
        'clip.mov',
        '-vn',
        '-c:a',
        'libmp3lame',
        '-b:a',
        '128k',
        '-abr',
        '1',
        '-sample_fmt',
        's16p',
        'clip_audio.mp3',
      ],
    ]);
  });

  it('ignores any crop filter for audio output (crop is a video-only concern)', () => {
    const attempts = getCommandAttempts('clip.mov', 'clip.mov', 'mp3', 'clip_audio.mp3', 'crop=100:100:0:0');

    // A crop filter must never leak into the audio command as a -vf argument.
    attempts.forEach((attempt) => {
      expect(attempt).not.toContain('-vf');
      expect(attempt).toContain('-vn');
    });
  });
});

describe('getCommandAttempts - video formats do not inherit audio constraints', () => {
  it.each(VIDEO_FORMATS)('never strips audio with -vn for %s output', (format) => {
    const attempts = getCommandAttempts('clip.mov', 'clip.mov', format, `clip.${format}`, null);

    expect(attempts.length).toBeGreaterThan(0);
    attempts.forEach((attempt) => {
      expect(attempt).not.toContain('-vn');
      expect(attempt).not.toContain('libmp3lame');
    });
  });

  it.each(VIDEO_FORMATS)('applies the crop filter to every %s attempt when provided', (format) => {
    const cropFilter = 'crop=1080:1920:0:0';
    const attempts = getCommandAttempts('clip.mov', 'clip.mov', format, `clip.${format}`, cropFilter);

    // Crop remains a supported video-mode capability across all video formats.
    const attemptsWithFilter = attempts.filter((attempt) => attempt.includes('-vf'));
    expect(attemptsWithFilter.length).toBeGreaterThan(0);
    attemptsWithFilter.forEach((attempt) => {
      const filterIndex = attempt.indexOf('-vf');
      expect(attempt[filterIndex + 1]).toBe(cropFilter);
    });
  });

  it('offers a stream-copy fast path only for webm-to-webm without cropping', () => {
    const withCopy = getCommandAttempts('clip.webm', 'clip.webm', 'webm', 'clip.webm', null);
    expect(withCopy[0]).toEqual(['-i', 'clip.webm', '-c', 'copy', 'clip.webm']);

    // Cropping a webm source must fall back to re-encoding (no naive copy).
    const withCrop = getCommandAttempts('clip.webm', 'clip.webm', 'webm', 'clip.webm', 'crop=100:100:0:0');
    expect(withCrop[0]).not.toEqual(['-i', 'clip.webm', '-c', 'copy', 'clip.webm']);
  });

  it('always terminates each attempt with the requested output file name', () => {
    VIDEO_FORMATS.forEach((format) => {
      const outputName = `clip.${format}`;
      const attempts = getCommandAttempts('clip.mov', 'clip.mov', format, outputName, null);
      attempts.forEach((attempt) => {
        expect(attempt[attempt.length - 1]).toBe(outputName);
      });
    });
  });
});

describe('getWavNormalizeCommand - transcription audio', () => {
  it('normalizes to 16 kHz mono pcm_s16le WAV with no video stream', () => {
    expect(getWavNormalizeCommand('input.mov', 'audio.wav')).toEqual([
      '-i', 'input.mov', '-vn', '-ar', '16000', '-ac', '1', '-c:a', 'pcm_s16le', 'audio.wav',
    ]);
  });
});

describe('trim range', () => {
  const trim = { start: 2.5, end: 10 };
  const trimArgs = ['-ss', '2.500', '-t', '7.500'];

  it('getTrimInputArgs returns nothing without a trim and seek/duration with one', () => {
    expect(getTrimInputArgs(null)).toEqual([]);
    expect(getTrimInputArgs(trim)).toEqual(trimArgs);
  });

  it('puts the trim args before -i in every attempt for each video format', () => {
    for (const format of VIDEO_FORMATS) {
      const attempts = getCommandAttempts('in.mp4', 'in.mp4', format, `out.${format}`, null, trim);
      for (const attempt of attempts) {
        expect(attempt.slice(0, 4)).toEqual(trimArgs);
        expect(attempt[4]).toBe('-i');
      }
    }
  });

  it('applies the trim to mp3 extraction', () => {
    const [attempt] = getCommandAttempts('in.mp4', 'in.mp4', 'mp3', 'in_audio.mp3', null, trim);
    expect(attempt.slice(0, 5)).toEqual([...trimArgs, '-i']);
  });

  it('skips the webm stream-copy attempt when trimmed', () => {
    const untrimmed = getCommandAttempts('in.webm', 'in.webm', 'webm', 'out.webm', null);
    const trimmed = getCommandAttempts('in.webm', 'in.webm', 'webm', 'out.webm', null, trim);

    expect(untrimmed[0]).toEqual(['-i', 'in.webm', '-c', 'copy', 'out.webm']);
    expect(trimmed.some((attempt) => attempt.includes('copy'))).toBe(false);
  });

  it('leaves commands unchanged when trim is null', () => {
    expect(getCommandAttempts('in.mp4', 'in.mp4', 'mp4', 'out.mp4', null, null)).toEqual(
      getCommandAttempts('in.mp4', 'in.mp4', 'mp4', 'out.mp4', null)
    );
  });

  it('applies the trim to the WAV normalize command', () => {
    expect(getWavNormalizeCommand('in.mp4', 'out.wav', trim).slice(0, 5)).toEqual([...trimArgs, '-i']);
    expect(getWavNormalizeCommand('in.mp4', 'out.wav')[0]).toBe('-i');
  });
});
