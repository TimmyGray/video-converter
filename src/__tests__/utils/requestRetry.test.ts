import { fetchWithExponentialBackoff } from '@/utils/requestRetry';

function response(status: number, retryAfter?: string): Response {
  return {
    status,
    headers: new Headers(retryAfter ? { 'Retry-After': retryAfter } : {}),
  } as Response;
}

describe('fetchWithExponentialBackoff', () => {
  it('retries 429 responses with exponential delays until the request succeeds', async () => {
    const fetchImpl = jest
      .fn()
      .mockResolvedValueOnce(response(429))
      .mockResolvedValueOnce(response(429))
      .mockResolvedValueOnce(response(200));
    const sleep = jest.fn().mockResolvedValue(undefined);

    await expect(
      fetchWithExponentialBackoff('https://example.test', {}, { fetchImpl, sleep, baseDelayMs: 100 })
    ).resolves.toMatchObject({ status: 200 });

    expect(fetchImpl).toHaveBeenCalledTimes(3);
    expect(sleep).toHaveBeenNthCalledWith(1, 100, undefined);
    expect(sleep).toHaveBeenNthCalledWith(2, 200, undefined);
  });

  it('honors Retry-After when it is longer than the exponential delay', async () => {
    const fetchImpl = jest.fn().mockResolvedValueOnce(response(429, '3')).mockResolvedValueOnce(response(200));
    const sleep = jest.fn().mockResolvedValue(undefined);

    await fetchWithExponentialBackoff('https://example.test', {}, { fetchImpl, sleep, baseDelayMs: 100 });

    expect(sleep).toHaveBeenCalledWith(3000, undefined);
  });
});
