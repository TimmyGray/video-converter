import {
  TokenValidationError,
  verifyHfToken,
  verifyOpenRouterToken,
} from '@/utils/providerTokenValidation';

function response(status: number): Response {
  return { ok: status >= 200 && status < 300, status, headers: new Headers() } as Response;
}

describe('provider token validation', () => {
  it('checks Hugging Face with whoami-v2', async () => {
    const fetchImpl = jest.fn().mockResolvedValue(response(200));

    await expect(verifyHfToken(' hf_x ', { fetchImpl })).resolves.toBeUndefined();
    expect(fetchImpl).toHaveBeenCalledWith(
      'https://huggingface.co/api/whoami-v2',
      expect.objectContaining({ headers: { Authorization: 'Bearer hf_x' } })
    );
  });

  it('checks OpenRouter with the current-key endpoint', async () => {
    const fetchImpl = jest.fn().mockResolvedValue(response(200));

    await expect(verifyOpenRouterToken('sk-or-v1_x', { fetchImpl })).resolves.toBeUndefined();
    expect(fetchImpl).toHaveBeenCalledWith(
      'https://openrouter.ai/api/v1/key',
      expect.objectContaining({ headers: { Authorization: 'Bearer sk-or-v1_x' } })
    );
  });

  it('does not accept an unauthorized token', async () => {
    const fetchImpl = jest.fn().mockResolvedValue(response(401));

    await expect(verifyOpenRouterToken('bad', { fetchImpl })).rejects.toBeInstanceOf(TokenValidationError);
  });
});
