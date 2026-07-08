import {
  chunksToSrt,
  chunksToVtt,
  formatTimestamp,
  serializeTranscript,
} from '@/utils/subtitleUtils';
import { TranscriptChunk } from '@/types';

const chunks: TranscriptChunk[] = [
  { text: ' Hello world.', timestamp: [0, 1.5] },
  { text: ' Second line.', timestamp: [1.5, 3.25] },
];

describe('formatTimestamp', () => {
  it('formats SRT timestamps with a comma millisecond separator', () => {
    expect(formatTimestamp(3661.25, ',')).toBe('01:01:01,250');
  });

  it('formats VTT timestamps with a dot millisecond separator', () => {
    expect(formatTimestamp(3661.25, '.')).toBe('01:01:01.250');
  });

  it('clamps negative or non-finite input to zero', () => {
    expect(formatTimestamp(-5, ',')).toBe('00:00:00,000');
    expect(formatTimestamp(Number.NaN, '.')).toBe('00:00:00.000');
  });
});

describe('chunksToSrt', () => {
  it('produces numbered cues with comma timestamps and trimmed text', () => {
    expect(chunksToSrt(chunks)).toBe(
      '1\n00:00:00,000 --> 00:00:01,500\nHello world.\n\n' +
        '2\n00:00:01,500 --> 00:00:03,250\nSecond line.\n'
    );
  });

  it('fills a missing end time from the next cue start', () => {
    const withNullEnd: TranscriptChunk[] = [
      { text: 'a', timestamp: [0, null] },
      { text: 'b', timestamp: [2, 3] },
    ];
    expect(chunksToSrt(withNullEnd)).toContain('00:00:00,000 --> 00:00:02,000');
  });

  it('defaults the final cue duration when end is missing and no next cue', () => {
    const single: TranscriptChunk[] = [{ text: 'only', timestamp: [5, null] }];
    expect(chunksToSrt(single)).toContain('00:00:05,000 --> 00:00:07,000');
  });
});

describe('chunksToVtt', () => {
  it('starts with the WEBVTT header and uses dot timestamps', () => {
    const vtt = chunksToVtt(chunks);
    expect(vtt.startsWith('WEBVTT\n\n')).toBe(true);
    expect(vtt).toContain('00:00:00.000 --> 00:00:01.500');
  });
});

describe('serializeTranscript', () => {
  it('returns trimmed plain text for txt', () => {
    expect(serializeTranscript('txt', '  Hello world.  ', chunks)).toBe('Hello world.\n');
  });

  it('delegates to SRT and VTT serializers', () => {
    expect(serializeTranscript('srt', '', chunks)).toBe(chunksToSrt(chunks));
    expect(serializeTranscript('vtt', '', chunks)).toBe(chunksToVtt(chunks));
  });
});
