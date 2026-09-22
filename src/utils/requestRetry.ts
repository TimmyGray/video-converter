const DEFAULT_MAX_RETRIES = 3;
const DEFAULT_BASE_DELAY_MS = 1_000;

export interface RetryOptions {
  fetchImpl?: typeof fetch;
  maxRetries?: number;
  baseDelayMs?: number;
  /** Injectable for deterministic unit tests. */
  sleep?: (delayMs: number, signal?: AbortSignal) => Promise<void>;
}

function abortError(): DOMException {
  return new DOMException('The request was cancelled.', 'AbortError');
}

export function sleepWithAbort(delayMs: number, signal?: AbortSignal): Promise<void> {
  if (signal?.aborted) return Promise.reject(abortError());

  return new Promise((resolve, reject) => {
    const timeout = setTimeout(cleanupAndResolve, delayMs);
    const onAbort = () => {
      clearTimeout(timeout);
      cleanup();
      reject(abortError());
    };
    const cleanup = () => signal?.removeEventListener('abort', onAbort);
    function cleanupAndResolve() {
      cleanup();
      resolve();
    }
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

function retryAfterMs(response: Response, fallbackMs: number): number {
  const value = response.headers?.get('Retry-After')?.trim();
  if (!value) return fallbackMs;

  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds >= 0) return Math.round(seconds * 1_000);

  const dateMs = Date.parse(value);
  return Number.isNaN(dateMs) ? fallbackMs : Math.max(0, dateMs - Date.now());
}

/**
 * Retries only HTTP 429 responses. The delay grows exponentially (1s, 2s, 4s by default),
 * while a provider's valid Retry-After header acts as a minimum delay. Cancellation interrupts
 * both an in-flight fetch and a scheduled retry.
 */
export async function fetchWithExponentialBackoff(
  input: RequestInfo | URL,
  init: RequestInit,
  options: RetryOptions = {}
): Promise<Response> {
  const doFetch = options.fetchImpl ?? fetch;
  const maxRetries = options.maxRetries ?? DEFAULT_MAX_RETRIES;
  const baseDelayMs = options.baseDelayMs ?? DEFAULT_BASE_DELAY_MS;
  const sleep = options.sleep ?? sleepWithAbort;

  for (let attempt = 0; ; attempt++) {
    const response = await doFetch(input, init);
    if (response.status !== 429 || attempt >= maxRetries) return response;

    const exponentialDelay = baseDelayMs * 2 ** attempt;
    await sleep(retryAfterMs(response, exponentialDelay), init.signal ?? undefined);
  }
}

/** Combines the caller's cancellation signal with a request timeout. */
export function requestSignal(timeoutMs: number, signal?: AbortSignal): AbortSignal {
  const timeout = AbortSignal.timeout(timeoutMs);
  return signal ? AbortSignal.any([signal, timeout]) : timeout;
}
