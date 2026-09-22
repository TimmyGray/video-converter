import {
  OPENROUTER_POLISH_MODEL,
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

describe('polishViaOpenRouter', () => {
  it('POSTs the configured Qwen model to OpenRouter using the user token', async () => {
    const fetchImpl = jest.fn().mockResolvedValue(chatResponse('Polished text.'));

    await polishViaOpenRouter('raw text.', { token: 'sk-or-v1_x', fetchImpl });

    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe('https://openrouter.ai/api/v1/chat/completions');
    expect(init.headers.Authorization).toBe('Bearer sk-or-v1_x');
    const body = JSON.parse(init.body);
    expect(body.model).toBe(OPENROUTER_POLISH_MODEL);
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
      status: 429,
      text: () => Promise.resolve('rate limited'),
    } as unknown as Response);

    await expect(
      polishViaOpenRouter('raw text.', {
        token: 'sk-or-v1_x',
        fetchImpl,
        retryOptions: { baseDelayMs: 0 },
      })
    ).rejects.toMatchObject({ name: 'OpenRouterPolishError', status: 429 });
    expect(fetchImpl).toHaveBeenCalledTimes(4);
    expect(OpenRouterPolishError).toBeDefined();
  });
});
