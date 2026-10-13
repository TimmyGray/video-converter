import {
  MAX_NEW_TOKENS_PER_WINDOW,
  RunawayGenerationError,
  SAMPLE_RATE,
  SEGMENT_SAMPLES,
  SegmentStreamer,
  countSegments,
  joinTranscriptText,
  offsetChunks,
  pickLanguageDetectionWindows,
  segmentBounds,
  segmentTokenBudget,
  windowsPerSegment,
} from '@/utils/transcriptionSegments';

const seconds = (s: number) => s * SAMPLE_RATE;

describe('countSegments', () => {
  it('splits into 60s segments and never returns zero', () => {
    expect(countSegments(0)).toBe(1);
    expect(countSegments(SEGMENT_SAMPLES)).toBe(1);
    expect(countSegments(SEGMENT_SAMPLES + 1)).toBe(2);
    expect(countSegments(seconds(3600))).toBe(60);
  });
});

describe('windowsPerSegment', () => {
  // Mirrors transformers.js chunking: 30s windows advancing by 30 − 2·5 = 20s.
  it.each([
    [0, 1],
    [seconds(30), 1],
    [seconds(31), 2],
    [seconds(50), 2],
    [seconds(51), 3],
    [seconds(60), 3],
  ])('%i samples -> %i windows', (samples, expected) => {
    expect(windowsPerSegment(samples)).toBe(expected);
  });
});

describe('segmentBounds', () => {
  it('clamps the last segment to the waveform end', () => {
    expect(segmentBounds(0, seconds(90))).toEqual({ start: 0, end: 60 });
    expect(segmentBounds(1, seconds(90))).toEqual({ start: 60, end: 90 });
  });
});

describe('offsetChunks', () => {
  it('shifts both ends and keeps an open end open', () => {
    expect(
      offsetChunks(
        [
          { text: 'a', timestamp: [0, 2] },
          { text: 'b', timestamp: [null as unknown as number, null] },
        ],
        60
      )
    ).toEqual([
      { text: 'a', timestamp: [60, 62] },
      { text: 'b', timestamp: [60, null] },
    ]);
  });
});

describe('joinTranscriptText', () => {
  it('joins trimmed non-empty parts with single spaces', () => {
    expect(joinTranscriptText(['', ' one ', '', 'two'])).toBe('one two');
  });
});

describe('pickLanguageDetectionWindows', () => {
  it('returns nothing for silence', () => {
    expect(pickLanguageDetectionWindows(new Float32Array(seconds(120)))).toEqual([]);
  });

  it('picks the loudest windows and returns them in time order', () => {
    const audio = new Float32Array(seconds(150)); // five 30s windows
    const fill = (windowIndex: number, level: number) =>
      audio.fill(level, seconds(windowIndex * 30), seconds((windowIndex + 1) * 30));
    fill(0, 0.01);
    fill(1, 0.5);
    fill(3, 0.2);
    fill(4, 0.3);

    expect(pickLanguageDetectionWindows(audio, 2)).toEqual([seconds(30), seconds(120)]);
    expect(pickLanguageDetectionWindows(audio)).toEqual([seconds(30), seconds(90), seconds(120)]);
  });
});

describe('SegmentStreamer', () => {
  it('ignores the prompt put of every generate call and reports window ends', () => {
    const onToken = jest.fn();
    const onWindowEnd = jest.fn();
    const streamer = new SegmentStreamer(10, { onToken, onWindowEnd });

    streamer.put([[1n, 2n, 3n]]); // prompt
    streamer.put([[4n]]);
    streamer.put([[5n]]);
    streamer.end();
    streamer.put([[1n, 2n, 3n]]); // prompt of the next window
    streamer.put([[6n]]);
    streamer.end();

    expect(onToken).toHaveBeenCalledTimes(3);
    expect(onWindowEnd.mock.calls).toEqual([[1], [2]]);
  });

  it('throws once the segment exceeds its token budget, aborting the decode', () => {
    const streamer = new SegmentStreamer(2);
    streamer.put([[1n]]); // prompt
    streamer.put([[2n]]);
    streamer.put([[3n]]);
    expect(() => streamer.put([[4n]])).toThrow(RunawayGenerationError);
  });

  it('budgets every window of a segment at the per-window cap', () => {
    expect(segmentTokenBudget(SEGMENT_SAMPLES)).toBeGreaterThanOrEqual(3 * MAX_NEW_TOKENS_PER_WINDOW);
    expect(segmentTokenBudget(seconds(10))).toBeLessThan(2 * MAX_NEW_TOKENS_PER_WINDOW);
  });
});
