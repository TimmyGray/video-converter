import {
  describePolishFailure,
  FREE_TIER_POLISH_MODEL,
  HfPolishError,
  POLISH_MODELS,
  polishTranscript,
  splitIntoBlocks,
} from '@/utils/hfPolish';

function errorResponse(status: number): Response {
  return {
    ok: false,
    status,
    text: () => Promise.resolve(`http ${status}`),
  } as unknown as Response;
}

/** What the browser surfaces when a 503 comes back without CORS headers. */
function corsBlockedFetch(): never {
  throw new TypeError('Failed to fetch');
}

function chatResponse(content: string, finishReason = 'stop'): Response {
  return {
    ok: true,
    status: 200,
    json: () =>
      Promise.resolve({ choices: [{ message: { content }, finish_reason: finishReason }] }),
  } as unknown as Response;
}

describe('polishTranscript', () => {
  it('POSTs an OpenAI-style chat completion to the HF router with auth and low temperature', async () => {
    const fetchImpl = jest.fn().mockResolvedValue(chatResponse('Polished.'));

    await polishTranscript('raw text.', { token: 'hf_x', fetchImpl });

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe('https://router.huggingface.co/v1/chat/completions');
    expect(init.method).toBe('POST');
    expect(init.headers.Authorization).toBe('Bearer hf_x');
    const body = JSON.parse(init.body);
    expect(body.model).toBe(POLISH_MODELS[0]);
    expect(body.temperature).toBeCloseTo(0.2);
    expect(body.messages).toHaveLength(2);
    expect(body.messages[0].role).toBe('system');
    // The prompt must forbid the failure modes of a weak model.
    expect(body.messages[0].content).toMatch(/do not add, remove, summarize, translate/i);
    expect(body.messages[0].content).toMatch(/only the corrected text/i);
    expect(body.messages[1]).toEqual({ role: 'user', content: 'raw text.' });
    // A hung router must not wedge the job forever.
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });

  it('returns the polished text and reports 100% progress', async () => {
    const fetchImpl = jest.fn().mockResolvedValue(chatResponse('Hello, world.'));
    const onProgress = jest.fn();

    const result = await polishTranscript('hello world', { token: 'hf_x', fetchImpl, onProgress });

    expect(result).toBe('Hello, world.');
    expect(onProgress).toHaveBeenLastCalledWith(100);
  });

  it('sends one request per block and joins polished blocks in order', async () => {
    // Two sentences, each ~2500 chars: must split into two blocks under the ~3500 budget.
    // Mocked outputs stay near ratio 1.0 so the sanity guardrail accepts them.
    const sentenceA = `${'a'.repeat(2500)}.`;
    const sentenceB = `${'b'.repeat(2500)}.`;
    const polishedA = `${'A'.repeat(2500)}.`;
    const polishedB = `${'B'.repeat(2500)}.`;
    const fetchImpl = jest
      .fn()
      .mockResolvedValueOnce(chatResponse(polishedA))
      .mockResolvedValueOnce(chatResponse(polishedB));
    const onProgress = jest.fn();

    const result = await polishTranscript(`${sentenceA} ${sentenceB}`, {
      token: 'hf_x',
      fetchImpl,
      onProgress,
    });

    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(result).toBe(`${polishedA} ${polishedB}`);
    expect(onProgress).toHaveBeenNthCalledWith(1, 50);
    expect(onProgress).toHaveBeenNthCalledWith(2, 100);
  });

  // The guardrail: a weak model that summarizes, blanks out, or rambles loses that block.
  it.each([
    ['empty output', ''],
    ['whitespace output', '   '],
    ['summarized output (too short)', 'ok.'],
    ['hallucinated output (too long)', 'x'.repeat(400)],
  ])('keeps the raw block when the model returns %s', async (_name, content) => {
    const raw = 'This is a reasonably sized transcript block for ratio checking purposes.';
    const fetchImpl = jest.fn().mockResolvedValue(chatResponse(content));

    const result = await polishTranscript(raw, { token: 'hf_x', fetchImpl });

    expect(result).toBe(raw);
  });

  it('accepts output within the [0.5, 2.0] length ratio', async () => {
    const raw = 'this block needs its punctuation and casing fixed by the model';
    const polished = 'This block needs its punctuation and casing fixed by the model.';
    const fetchImpl = jest.fn().mockResolvedValue(chatResponse(polished));

    await expect(polishTranscript(raw, { token: 'hf_x', fetchImpl })).resolves.toBe(polished);
  });

  // A truncated completion (finish_reason 'length') can sit inside the length ratio while
  // silently dropping the block's tail — e.g. CJK text where chars ≈ tokens. Must keep raw.
  it('keeps the raw block when the completion was cut off by max_tokens', async () => {
    const raw = 'a transcript block whose polished form got truncated by the token limit';
    const truncated = 'a transcript block whose polished form got truncated by the';
    const fetchImpl = jest.fn().mockResolvedValue(chatResponse(truncated, 'length'));

    await expect(polishTranscript(raw, { token: 'hf_x', fetchImpl })).resolves.toBe(raw);
  });

  it('skips the request entirely for whitespace-only input', async () => {
    const fetchImpl = jest.fn();
    const onProgress = jest.fn();

    const result = await polishTranscript('   ', { token: 'hf_x', fetchImpl, onProgress });

    expect(result).toBe('   ');
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(onProgress).toHaveBeenLastCalledWith(100);
  });

  it('throws HfPolishError with the status when the router returns malformed JSON', async () => {
    const fetchImpl = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.reject(new SyntaxError('Unexpected token')),
    } as unknown as Response);

    await expect(
      polishTranscript('some text', { token: 'hf_x', fetchImpl })
    ).rejects.toMatchObject({ name: 'HfPolishError', status: 200 });
  });

  it('throws HfPolishError with the HTTP status on a non-ok response', async () => {
    const fetchImpl = jest.fn().mockResolvedValue({
      ok: false,
      status: 429,
      text: () => Promise.resolve('rate limited'),
    } as unknown as Response);

    await expect(
      polishTranscript('some text', { token: 'hf_x', fetchImpl })
    ).rejects.toMatchObject({ name: 'HfPolishError', status: 429 });
  });
});

// A single hardcoded model dies whenever that model/provider is unavailable to the
// account (HF answers 503, and its 503 path omits CORS headers -> opaque TypeError).
describe('model fallback ladder', () => {
  it('advertises more than one candidate, cheapest-capable first', () => {
    expect(POLISH_MODELS.length).toBeGreaterThan(1);
    expect(new Set(POLISH_MODELS).size).toBe(POLISH_MODELS.length);
    // Reasoning variants emit chain-of-thought and would violate "reply with ONLY the text".
    for (const model of POLISH_MODELS) expect(model).not.toMatch(/thinking/i);
    // Coder-tuned variants are the wrong domain for prose transcripts.
    for (const model of POLISH_MODELS) expect(model).not.toMatch(/coder/i);
  });

  it('ends on a zero-cost model so polish survives an exhausted credit allowance', () => {
    expect(POLISH_MODELS[POLISH_MODELS.length - 1]).toBe(FREE_TIER_POLISH_MODEL);
    expect(POLISH_MODELS.slice(0, -1)).not.toContain(FREE_TIER_POLISH_MODEL);
  });

  it('advances to the next model on a 503', async () => {
    const fetchImpl = jest
      .fn()
      .mockResolvedValueOnce(errorResponse(503))
      .mockResolvedValueOnce(chatResponse('Polished text here.'));

    const result = await polishTranscript('polished text here', { token: 'hf_x', fetchImpl });

    expect(result).toBe('Polished text here.');
    expect(JSON.parse(fetchImpl.mock.calls[0][1].body).model).toBe(POLISH_MODELS[0]);
    expect(JSON.parse(fetchImpl.mock.calls[1][1].body).model).toBe(POLISH_MODELS[1]);
  });

  it('advances on an opaque CORS-blocked failure', async () => {
    const fetchImpl = jest
      .fn()
      .mockImplementationOnce(corsBlockedFetch)
      .mockResolvedValueOnce(chatResponse('Polished text here.'));

    await expect(
      polishTranscript('polished text here', { token: 'hf_x', fetchImpl })
    ).resolves.toBe('Polished text here.');
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it('pins the working model for later blocks instead of re-probing', async () => {
    const sentenceA = `${'a'.repeat(2500)}.`;
    const sentenceB = `${'b'.repeat(2500)}.`;
    const fetchImpl = jest
      .fn()
      .mockResolvedValueOnce(errorResponse(503))
      .mockResolvedValueOnce(chatResponse(`${'A'.repeat(2500)}.`))
      .mockResolvedValueOnce(chatResponse(`${'B'.repeat(2500)}.`));

    await polishTranscript(`${sentenceA} ${sentenceB}`, { token: 'hf_x', fetchImpl });

    expect(fetchImpl).toHaveBeenCalledTimes(3);
    // Block 2 goes straight to the model that worked — no repeat of the dead one.
    expect(JSON.parse(fetchImpl.mock.calls[2][1].body).model).toBe(POLISH_MODELS[1]);
  });

  it('throws once every candidate is exhausted, reporting the last status', async () => {
    const fetchImpl = jest.fn().mockResolvedValue(errorResponse(503));

    await expect(
      polishTranscript('some text', { token: 'hf_x', fetchImpl })
    ).rejects.toMatchObject({ name: 'HfPolishError', status: 503 });
    expect(fetchImpl).toHaveBeenCalledTimes(POLISH_MODELS.length);
  });

  // Credits are per-account, not per-model, but the ladder ends in a zero-cost model —
  // so an exhausted allowance must fall through to it rather than abort.
  it('advances on 402 so an exhausted credit allowance reaches the free model', async () => {
    const fetchImpl = jest.fn().mockResolvedValue(errorResponse(402));

    await expect(
      polishTranscript('some text', { token: 'hf_x', fetchImpl })
    ).rejects.toMatchObject({ status: 402 });
    expect(fetchImpl).toHaveBeenCalledTimes(POLISH_MODELS.length);
  });

  // A bad token fails identically on every model — burning the whole ladder just delays
  // the notice.
  it.each([401, 403, 429])('does not retry other models on %s', async (status) => {
    const fetchImpl = jest.fn().mockResolvedValue(errorResponse(status));

    await expect(
      polishTranscript('some text', { token: 'hf_x', fetchImpl })
    ).rejects.toMatchObject({ status });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });
});

describe('splitIntoBlocks', () => {
  it('returns short text as a single block', () => {
    expect(splitIntoBlocks('one sentence.')).toEqual(['one sentence.']);
  });

  it('splits at sentence boundaries and reproduces the input byte-for-byte on join', () => {
    const text = Array.from({ length: 10 }, (_, i) => `Sentence ${i} ${'x'.repeat(500)}.`).join(' ');
    const blocks = splitIntoBlocks(text);

    expect(blocks.length).toBeGreaterThan(1);
    for (const block of blocks) {
      expect(block.length).toBeLessThanOrEqual(3500);
      expect(block.trimEnd().endsWith('.')).toBe(true);
    }
    // The whole contract: concatenation loses and gains nothing.
    expect(blocks.join('')).toBe(text);
  });

  it('hard-splits a single sentence longer than the budget instead of dropping it', () => {
    const monster = 'y'.repeat(9000);
    const blocks = splitIntoBlocks(monster);

    expect(blocks.length).toBeGreaterThan(1);
    for (const block of blocks) expect(block.length).toBeLessThanOrEqual(3500);
    expect(blocks.join('')).toBe(monster);
  });

  it('never splits a surrogate pair at a hard-split boundary', () => {
    // Emoji placed so the 3500-char boundary lands between its two UTF-16 code units.
    const text = `${'a'.repeat(3499)}😀${'b'.repeat(200)}`;
    const blocks = splitIntoBlocks(text);

    expect(blocks.join('')).toBe(text);
    for (const block of blocks) {
      // No block may end on a lone high surrogate (or start on a lone low one).
      expect(/[\uD800-\uDBFF]$/.test(block)).toBe(false);
      expect(/^[\uDC00-\uDFFF]/.test(block)).toBe(false);
    }
  });
});

describe('raw-content preservation through polishTranscript', () => {
  it('reproduces an unpunctuated multi-block text exactly when every block fails the guardrail', async () => {
    // Whisper often emits long unpunctuated runs; the guardrail keep-raw path must not
    // inject separators at hard-split boundaries.
    const monster = 'word '.repeat(1500).trimEnd(); // 7499 chars, no terminal punctuation
    const fetchImpl = jest.fn().mockResolvedValue(chatResponse('nope'));

    const result = await polishTranscript(monster, { token: 'hf_x', fetchImpl });

    expect(result).toBe(monster);
  });

  it('preserves inter-block whitespace when blocks are polished', async () => {
    const sentenceA = `${'a'.repeat(2500)}.`;
    const sentenceB = `${'b'.repeat(2500)}.`;
    const polishedA = `${'A'.repeat(2500)}.`;
    const polishedB = `${'B'.repeat(2500)}.`;
    const fetchImpl = jest
      .fn()
      .mockResolvedValueOnce(chatResponse(polishedA))
      .mockResolvedValueOnce(chatResponse(polishedB));

    const result = await polishTranscript(`${sentenceA} ${sentenceB}`, {
      token: 'hf_x',
      fetchImpl,
    });

    expect(result).toBe(`${polishedA} ${polishedB}`);
  });
});

describe('describePolishFailure', () => {
  it.each([
    [401, /token/i],
    [403, /token/i],
  ])('explains a %s as a token problem', (status, expected) => {
    expect(describePolishFailure(new HfPolishError('boom', status))).toMatch(expected);
  });

  it('explains a 429 as a rate limit', () => {
    expect(describePolishFailure(new HfPolishError('boom', 429))).toMatch(/rate limit/i);
  });

  it('explains a 503 as the model warming up', () => {
    expect(describePolishFailure(new HfPolishError('boom', 503))).toMatch(/unavailable|loading/i);
  });

  it('explains a status-less failure as unreachable or blocked, not merely offline', () => {
    const message = describePolishFailure(new TypeError('Failed to fetch'));
    expect(message).toMatch(/reach|network|connect/i);
    // The observed real-world cause is a CORS-stripped 503, not a dead connection.
    expect(message).toMatch(/unavailable|blocked/i);
  });

  it('always states that the transcript was left unpolished', () => {
    for (const error of [
      new HfPolishError('boom', 401),
      new HfPolishError('boom', 500),
      new TypeError('Failed to fetch'),
      'not an error',
    ]) {
      expect(describePolishFailure(error)).toMatch(/unpolished/i);
    }
  });
});
