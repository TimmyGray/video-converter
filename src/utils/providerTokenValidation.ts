import { fetchWithExponentialBackoff, requestSignal } from '@/utils/requestRetry';

const HF_WHOAMI_ENDPOINT = 'https://huggingface.co/api/whoami-v2';
const OPENROUTER_KEY_ENDPOINT = 'https://openrouter.ai/api/v1/key';
const VALIDATION_TIMEOUT_MS = 15_000;

export class TokenValidationError extends Error {
  readonly status?: number;

  constructor(provider: string, status?: number) {
    super(
      status === 401 || status === 403
        ? `${provider} rejected this token (HTTP ${status}).`
        : status === 429
          ? `${provider} is rate limiting token verification. Try again shortly.`
          : status
            ? `${provider} could not verify this token (HTTP ${status}).`
            : `Could not reach ${provider} to verify this token.`
    );
    this.name = 'TokenValidationError';
    this.status = status;
  }
}

export interface TokenValidationOptions {
  fetchImpl?: typeof fetch;
  signal?: AbortSignal;
}

async function verify(
  provider: string,
  endpoint: string,
  token: string,
  options: TokenValidationOptions
): Promise<void> {
  let response: Response;
  try {
    response = await fetchWithExponentialBackoff(
      endpoint,
      {
        method: 'GET',
        signal: requestSignal(VALIDATION_TIMEOUT_MS, options.signal),
        headers: { Authorization: `Bearer ${token.trim()}` },
      },
      { fetchImpl: options.fetchImpl }
    );
  } catch {
    throw new TokenValidationError(provider);
  }

  if (!response.ok) throw new TokenValidationError(provider, response.status);
}

/** Validates a Hugging Face token without reading or retaining the response body. */
export function verifyHfToken(token: string, options: TokenValidationOptions = {}): Promise<void> {
  return verify('Hugging Face', HF_WHOAMI_ENDPOINT, token, options);
}

/** Validates an OpenRouter API key without reading or retaining the response body. */
export function verifyOpenRouterToken(
  token: string,
  options: TokenValidationOptions = {}
): Promise<void> {
  return verify('OpenRouter', OPENROUTER_KEY_ENDPOINT, token, options);
}
