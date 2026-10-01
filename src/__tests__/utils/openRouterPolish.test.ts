import {
  OPENROUTER_POLISH_MODELS,
  OpenRouterPolishError,
  polishViaOpenRouter,
} from '@/utils/openRouterPolish';

function chatResponse(content: string, finishReason = 'stop'): Response {
  return {
    ok: true,
    status: 200,
    json: () =>
      Promise.resolve({ choices: [{ message: { content }, finish_reason: finishReason }] }),
  } as unknown as Response;
}

function errorResponse(status: number): Response {
  return {
    ok: false,
    status,
    text: () => Promise.resolve('provider error'),
  } as unknown as Response;
}

describe('polishViaOpenRouter', () => {
  it('POSTs the first ladder model to OpenRouter using the user token', async () => {
    const fetchImpl = jest.fn().mockResolvedValue(chatResponse('Polished text.'));

    await polishViaOpenRouter('raw text.', { token: 'sk-or-v1_x', fetchImpl });

    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe('https://openrouter.ai/api/v1/chat/completions');
    expect(init.headers.Authorization).toBe('Bearer sk-or-v1_x');
    const body = JSON.parse(init.body);
    expect(body.model).toBe(OPENROUTER_POLISH_MODELS[0]);
    expect(body.temperature).toBeCloseTo(0.2);
    expect(body.messages[0].role).toBe('system');
    expect(body.messages[1]).toEqual({ role: 'user', content: 'raw text.' });
  });

  it('keeps the raw block when the completion is truncated', async () => {
    const raw = 'a transcript block whose cleaned form is cut short by the model';
    const fetchImpl = jest.fn().mockResolvedValue(chatResponse('a transcript block whose', 'length'));

    await expect(polishViaOpenRouter(raw, { token: 'sk-or-v1_x', fetchImpl })).resolves.toBe(raw);
  });

  it('retains HTTP status on failures so the caller can explain a fallback', async () => {
    const fetchImpl = jest.fn().mockResolvedValue({
      ok: false,
      status: 401,
      text: () => Promise.resolve('bad token'),
    } as unknown as Response);

    await expect(
      polishViaOpenRouter('raw text.', {
        token: 'sk-or-v1_x',
        fetchImpl,
        retryOptions: { baseDelayMs: 0 },
      })
    ).rejects.toMatchObject({ name: 'OpenRouterPolishError', status: 401 });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(OpenRouterPolishError).toBeDefined();
  });
});

// A single hardcoded free model dies whenever OpenRouter's shared upstream pool for it is
// saturated (the 429 this ladder exists for: "qwen3.8-27b:free is temporarily rate-limited
// upstream", limit_source: upstream_provider_shared_pool).
describe('model fallback ladder', () => {
  it('advertises more than one candidate, spread across upstream vendors', () => {
    expect(OPENROUTER_POLISH_MODELS.length).toBeGreaterThan(1);
    expect(new Set(OPENROUTER_POLISH_MODELS).size).toBe(OPENROUTER_POLISH_MODELS.length);
    expect(OPENROUTER_POLISH_MODELS.every((model) => model.endsWith(':free'))).toBe(true);
    // Reasoning variants emit chain-of-thought and would violate "reply with ONLY the text".
    for (const model of OPENROUTER_POLISH_MODELS) expect(model).not.toMatch(/thinking|reasoning/i);
    // Coder-tuned variants are the wrong domain for prose transcripts.
    for (const model of OPENROUTER_POLISH_MODELS) expect(model).not.toMatch(/coder/i);
  });

  // maxRetries: 0 isolates ladder-advance from fetchWithExponentialBackoff's own 429 retries
  // (otherwise a persistent 429 on model 0 alone would consume 4 fetchImpl calls before advancing).
  it('advances to the next model on a 429 (unlike the HF ladder, which aborts on 429)', async () => {
    const fetchImpl = jest
      .fn()
      .mockResolvedValueOnce(errorResponse(429))
      .mockResolvedValueOnce(chatResponse('Polished text here.'));

    const result = await polishViaOpenRouter('polished text here', {
      token: 'sk-or-v1_x',
      fetchImpl,
      retryOptions: { maxRetries: 0, baseDelayMs: 0 },
    });

    expect(result).toBe('Polished text here.');
    expect(JSON.parse(fetchImpl.mock.calls[0][1].body).model).toBe(OPENROUTER_POLISH_MODELS[0]);
    expect(JSON.parse(fetchImpl.mock.calls[1][1].body).model).toBe(OPENROUTER_POLISH_MODELS[1]);
  });

  it('pins the working model for later blocks instead of re-probing', async () => {
    const sentenceA = `${'a'.repeat(2500)}.`;
    const sentenceB = `${'b'.repeat(2500)}.`;
    const fetchImpl = jest
      .fn()
      .mockResolvedValueOnce(errorResponse(429))
      .mockResolvedValueOnce(chatResponse(`${'A'.repeat(2500)}.`))
      .mockResolvedValueOnce(chatResponse(`${'B'.repeat(2500)}.`));

    await polishViaOpenRouter(`${sentenceA} ${sentenceB}`, {
      token: 'sk-or-v1_x',
      fetchImpl,
      retryOptions: { maxRetries: 0, baseDelayMs: 0 },
    });

    expect(fetchImpl).toHaveBeenCalledTimes(3);
    // Block 2 goes straight to the model that worked — no repeat of the dead one.
    expect(JSON.parse(fetchImpl.mock.calls[2][1].body).model).toBe(OPENROUTER_POLISH_MODELS[1]);
  });

  it('throws once every candidate is exhausted, reporting the last status', async () => {
    const fetchImpl = jest.fn().mockResolvedValue(errorResponse(500));

    await expect(
      polishViaOpenRouter('some text', { token: 'sk-or-v1_x', fetchImpl })
    ).rejects.toMatchObject({ name: 'OpenRouterPolishError', status: 500 });
    expect(fetchImpl).toHaveBeenCalledTimes(OPENROUTER_POLISH_MODELS.length);
  });

  it('retries a 429 with backoff on a single model before advancing', async () => {
    const fetchImpl = jest.fn().mockResolvedValue(errorResponse(429));

    await expect(
      polishViaOpenRouter('some text', {
        token: 'sk-or-v1_x',
        fetchImpl,
        retryOptions: { baseDelayMs: 0 },
      })
    ).rejects.toMatchObject({ status: 429 });
    // 4 attempts (1 + 3 retries) per model, exhausted across every ladder candidate.
    expect(fetchImpl).toHaveBeenCalledTimes(4 * OPENROUTER_POLISH_MODELS.length);
  });

  // A bad token fails identically on every model — burning the whole ladder just delays the notice.
  it('does not try another model on a bad token', async () => {
    const fetchImpl = jest.fn().mockResolvedValue(errorResponse(401));

    await expect(
      polishViaOpenRouter('some text', { token: 'sk-or-v1_x', fetchImpl })
    ).rejects.toMatchObject({ status: 401 });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('advances on 403 because the selected model may be gated', async () => {
    const fetchImpl = jest
      .fn()
      .mockResolvedValueOnce(errorResponse(403))
      .mockResolvedValueOnce(chatResponse('Polished text here.'));

    await expect(
      polishViaOpenRouter('polished text here', { token: 'sk-or-v1_x', fetchImpl })
    ).resolves.toBe('Polished text here.');
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });
});
