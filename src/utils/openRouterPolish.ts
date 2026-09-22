import { HfPolishError, POLISH_SYSTEM_PROMPT, splitIntoBlocks } from '@/utils/hfPolish';
import { fetchWithExponentialBackoff, requestSignal, type RetryOptions } from '@/utils/requestRetry';

const OPENROUTER_CHAT_ENDPOINT = 'https://openrouter.ai/api/v1/chat/completions';
export const OPENROUTER_POLISH_MODEL = 'qwen/qwen3.8-27b:free';
const REQUEST_TIMEOUT_MS = 60_000;
const MIN_LENGTH_RATIO = 0.5;
const MAX_LENGTH_RATIO = 2.0;

export interface OpenRouterPolishOptions {
  token: string;
  onProgress?: (percent: number) => void;
  /** Emits the partially polished transcript while blocks finish. */
  onPartialText?: (text: string) => void;
  /** Cancels the current request and any scheduled rate-limit retry. */
  signal?: AbortSignal;
  /** Test-only retry configuration; production uses the standard exponential policy. */
  retryOptions?: Omit<RetryOptions, 'fetchImpl'>;
  /** Injectable for tests; defaults to global fetch. */
  fetchImpl?: typeof fetch;
}

interface ChatCompletionResponse {
  choices?: Array<{ message?: { content?: string }; finish_reason?: string }>;
}

/** A failed OpenRouter cleanup request, retaining the received HTTP status when available. */
export class OpenRouterPolishError extends HfPolishError {
  constructor(message: string, status?: number) {
    super(message, status);
    this.name = 'OpenRouterPolishError';
  }
}

async function requestPolish(
  body: string,
  token: string,
  doFetch: typeof fetch,
  signal?: AbortSignal,
  retryOptions?: Omit<RetryOptions, 'fetchImpl'>
): Promise<ChatCompletionResponse> {
  let response: Response;
  try {
    response = await fetchWithExponentialBackoff(OPENROUTER_CHAT_ENDPOINT, {
      method: 'POST',
      signal: requestSignal(REQUEST_TIMEOUT_MS, signal),
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: OPENROUTER_POLISH_MODEL,
        temperature: 0.2,
        max_tokens: Math.min(4096, body.length + 128),
        messages: [
          { role: 'system', content: POLISH_SYSTEM_PROMPT },
          { role: 'user', content: body },
        ],
      }),
    }, { ...retryOptions, fetchImpl: doFetch });
  } catch (networkError) {
    throw new OpenRouterPolishError(
      `OpenRouter polish request could not complete: ${
        networkError instanceof Error ? networkError.message : String(networkError)
      }`
    );
  }

  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    throw new OpenRouterPolishError(
      `OpenRouter polish request failed (${response.status}). ${detail}`.trim(),
      response.status
    );
  }

  try {
    return (await response.json()) as ChatCompletionResponse;
  } catch {
    throw new OpenRouterPolishError(
      `OpenRouter polish returned malformed JSON (${response.status}).`,
      response.status
    );
  }
}

/**
 * Polishes a transcript through OpenRouter's Qwen 3.8 free model. It uses the same block
 * boundaries and raw-text guardrail as Hugging Face cleanup, so provider fallback cannot
 * truncate or otherwise corrupt a transcript.
 */
export async function polishViaOpenRouter(
  text: string,
  options: OpenRouterPolishOptions
): Promise<string> {
  const doFetch = options.fetchImpl ?? fetch;
  const blocks = splitIntoBlocks(text);
  const polished: string[] = [];

  for (let i = 0; i < blocks.length; i++) {
    const block = blocks[i];
    const reportProgress = () =>
      options.onProgress?.(Math.round(((i + 1) / blocks.length) * 100));
    const body = block.trim();
    if (!body) {
      polished.push(block);
      reportProgress();
      continue;
    }

    const lead = block.slice(0, block.indexOf(body));
    const trail = block.slice(lead.length + body.length);
    const data = await requestPolish(
      body,
      options.token,
      doFetch,
      options.signal,
      options.retryOptions
    );
    const choice = data.choices?.[0];
    const candidate = (choice?.message?.content ?? '').trim();
    const ratio = candidate.length / body.length;
    const sane =
      candidate.length > 0 &&
      ratio >= MIN_LENGTH_RATIO &&
      ratio <= MAX_LENGTH_RATIO &&
      choice?.finish_reason !== 'length';
    polished.push(sane ? lead + candidate + trail : block);
    options.onPartialText?.(polished.join('') + blocks.slice(i + 1).join(''));
    reportProgress();
  }

  return polished.join('');
}
