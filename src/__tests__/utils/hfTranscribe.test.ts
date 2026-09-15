import { describeHfFailure, HfTranscribeError, transcribeViaHf } from '@/utils/hfTranscribe';

const SEGMENT_SAMPLES = 60 * 16_000;

function jsonResponse(body: unknown): Response {
  return {
    ok: true,
    status: 200,
    json: () => Promise.resolve(body),
  } as unknown as Response;
}

describe('transcribeViaHf', () => {
  it('POSTs to the HF router with a bearer token and timestamps enabled', async () => {
    const fetchImpl = jest.fn().mockResolvedValue(jsonResponse({ text: 'hello', chunks: [] }));

    await transcribeViaHf(new Float32Array([0, 0.1, -0.1]), { token: 'hf_x', fetchImpl });

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toContain('router.huggingface.co');
    expect(url).toContain('whisper-large-v3');
    expect(init.method).toBe('POST');
    expect(init.headers.Authorization).toBe('Bearer hf_x');
    const body = JSON.parse(init.body);
    expect(body.parameters.return_timestamps).toBe(true);
    expect(typeof body.inputs).toBe('string');
  });

  it('aggregates text and streams accumulated partials', async () => {
    const fetchImpl = jest.fn().mockResolvedValue(
      jsonResponse({ text: 'hello world', chunks: [{ text: 'hello world', timestamp: [0, 1] }] })
    );
    const onPartialText = jest.fn();
    const onProgress = jest.fn();

    const result = await transcribeViaHf(new Float32Array([0.2, 0.2]), {
      token: 'hf_x',
      fetchImpl,
      onPartialText,
      onProgress,
    });

    expect(result.text).toBe('hello world');
    expect(result.chunks).toEqual([{ text: 'hello world', timestamp: [0, 1] }]);
    expect(onPartialText).toHaveBeenLastCalledWith('hello world');
    expect(onProgress).toHaveBeenLastCalledWith(100);
  });

  it('offsets chunk timestamps by each segment start', async () => {
    const fetchImpl = jest
      .fn()
      .mockResolvedValue(jsonResponse({ text: 'x', chunks: [{ text: 'x', timestamp: [0, 1] }] }));

    // One sample past the first 60s window forces a second segment (offset 60s).
    const result = await transcribeViaHf(new Float32Array(SEGMENT_SAMPLES + 1), {
      token: 'hf_x',
      fetchImpl,
    });

    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(result.chunks[0].timestamp).toEqual([0, 1]);
    expect(result.chunks[1].timestamp).toEqual([60, 61]);
  });

  it('throws on a non-ok response so the caller can fall back', async () => {
    const fetchImpl = jest.fn().mockResolvedValue({
      ok: false,
      status: 401,
      text: () => Promise.resolve('unauthorized'),
    } as unknown as Response);

    await expect(
      transcribeViaHf(new Float32Array([0.1]), { token: 'bad', fetchImpl })
    ).rejects.toThrow(/401/);
  });

  // AC1: the HTTP status must survive the throw so the UI can explain *why* it fell back.
  it('attaches the HTTP status to the thrown error', async () => {
    const fetchImpl = jest.fn().mockResolvedValue({
      ok: false,
      status: 401,
      text: () => Promise.resolve('invalid credentials'),
    } as unknown as Response);

    await expect(
      transcribeViaHf(new Float32Array([0.1]), { token: 'bad', fetchImpl })
    ).rejects.toMatchObject({ name: 'HfTranscribeError', status: 401 });
  });
});

// AC2: pure mapping of a hosted failure to a user-facing sentence. No React, no side effects.
describe('describeHfFailure', () => {
  it.each([
    [401, /token/i],
    [403, /token/i],
  ])('explains a %s as a token problem', (status, expected) => {
    expect(describeHfFailure(new HfTranscribeError('boom', status))).toMatch(expected);
  });

  it('explains a 429 as a rate limit', () => {
    expect(describeHfFailure(new HfTranscribeError('boom', 429))).toMatch(/rate limit/i);
  });

  it('explains a 503 as the model warming up', () => {
    expect(describeHfFailure(new HfTranscribeError('boom', 503))).toMatch(/unavailable|loading/i);
  });

  it('explains a status-less failure as a connection problem', () => {
    expect(describeHfFailure(new TypeError('Failed to fetch'))).toMatch(/reach|network|connect/i);
  });

  it('falls back to a generic message with the status for other codes', () => {
    expect(describeHfFailure(new HfTranscribeError('boom', 500))).toContain('500');
  });

  it('always states that transcription continued on-device', () => {
    for (const error of [
      new HfTranscribeError('boom', 401),
      new HfTranscribeError('boom', 429),
      new HfTranscribeError('boom', 503),
      new HfTranscribeError('boom', 500),
      new TypeError('Failed to fetch'),
      'not even an error',
    ]) {
      expect(describeHfFailure(error)).toMatch(/on-device/i);
    }
  });
});
