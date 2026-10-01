import { HfPolishError, POLISH_SYSTEM_PROMPT, splitIntoBlocks } from '@/utils/hfPolish';
import { fetchWithExponentialBackoff, requestSignal, type RetryOptions } from '@/utils/requestRetry';

const OPENROUTER_CHAT_ENDPOINT = 'https://openrouter.ai/api/v1/chat/completions';

/**
 * Model fallback ladder, mirroring POLISH_MODELS in hfPolish.ts: try each candidate in order
 * until one answers, then pin it for the rest of the transcript.
 *
 * A single hardcoded free model is fragile — OpenRouter's `:free` tier routes to a shared
 * upstream pool per model/provider (e.g. the 429 this ladder exists for: "qwen3.8-27b:free is
 * temporarily rate-limited upstream", `limit_source: upstream_provider_shared_pool`), so
 * congestion on one model says nothing about the others. Candidates below are spread across
 * different upstream vendors (Alibaba, Google, NVIDIA) so a single saturated pool doesn't take
 * out the whole ladder. Each is plain instruction-tuned — not a "thinking"/reasoning variant —
 * so none should emit chain-of-thought when asked to return only corrected transcript text.
 */
export const OPENROUTER_POLISH_MODELS = [
  'qwen/qwen3.8-27b:free',
  'google/gemma-4-26b-a4b-it:free',
  'nvidia/nemotron-3-super-120b-a12b:free',
] as const;

const REQUEST_TIMEOUT_MS = 60_000;
const MIN_LENGTH_RATIO = 0.5;
const MAX_LENGTH_RATIO = 2.0;

/**
 * Statuses that mean "this model/provider won't serve you" — worth trying the next candidate.
 * Unlike HF's ladder, 429 advances here: OpenRouter's free tier saturates per upstream provider
 * sharing one model, not per account, so a 429 on one candidate says nothing about the next.
 * Only 401 (bad token) fails identically on every candidate and aborts the ladder immediately.
 */
function isModelUnavailable(status: number | undefined): boolean {
  if (status === undefined) return true; // opaque failure: CORS-stripped error, DNS, offline
  return status !== 401;
}

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
  model: string,
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
        model,
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
      `OpenRouter polish request to ${model} could not complete: ${
        networkError instanceof Error ? networkError.message : String(networkError)
      }`
    );
  }

  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    throw new OpenRouterPolishError(
      `OpenRouter polish request to ${model} failed (${response.status}). ${detail}`.trim(),
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
 * Polishes a transcript through OpenRouter's free-tier model ladder (OPENROUTER_POLISH_MODELS).
 * It uses the same block boundaries and raw-text guardrail as Hugging Face cleanup, so provider
 * fallback cannot truncate or otherwise corrupt a transcript.
 */
export async function polishViaOpenRouter(
  text: string,
  options: OpenRouterPolishOptions
): Promise<string> {
  const doFetch = options.fetchImpl ?? fetch;
  const blocks = splitIntoBlocks(text);

  /** Index into OPENROUTER_POLISH_MODELS; advances past candidates this account cannot reach. */
  let modelIndex = 0;
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

    // Walk the ladder from the pinned model. A candidate that answers is pinned for every
    // later block, so the dead ones are probed once per transcript, not once per block.
    let data: ChatCompletionResponse | null = null;
    let lastError: OpenRouterPolishError | null = null;
    for (let m = modelIndex; m < OPENROUTER_POLISH_MODELS.length; m++) {
      try {
        data = await requestPolish(
          OPENROUTER_POLISH_MODELS[m],
          body,
          options.token,
          doFetch,
          options.signal,
          options.retryOptions
        );
        modelIndex = m;
        lastError = null;
        break;
      } catch (error) {
        lastError = error instanceof OpenRouterPolishError ? error : new OpenRouterPolishError(String(error));
        if (!isModelUnavailable(lastError.status)) break;
        console.warn(
          `[VideoConverter] OpenRouter polish model ${OPENROUTER_POLISH_MODELS[m]} unavailable; trying next:`,
          lastError.message
        );
      }
    }
    if (!data) throw lastError ?? new OpenRouterPolishError('OpenRouter polish failed.');

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
