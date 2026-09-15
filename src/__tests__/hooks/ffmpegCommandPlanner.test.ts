import { getCommandAttempts, getWavNormalizeCommand } from '@/hooks/ffmpegCommandPlanner';
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
