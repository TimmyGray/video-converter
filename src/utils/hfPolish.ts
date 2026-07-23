const HF_CHAT_ENDPOINT = 'https://router.huggingface.co/v1/chat/completions';

/**
 * Model fallback ladder, mirroring the FFmpeg command ladder and the Whisper device ladder:
 * try each in order until one answers, then pin it for the rest of the transcript.
 *
 * A single hardcoded model is fragile — HF Inference Providers routes to third parties, and a
 * model can be unavailable to a given account (no credits left, provider down, provider not
 * enabled). The router answers 503 for that, and its 503 path omits CORS headers, so the browser
 * reports an opaque `TypeError: Failed to fetch` with no status. The ladder is what makes the
 * feature survive that.
 *
 * Ordering is cheapest-capable first — HF's "free" tier is a small monthly credit allowance, so
 * price per token decides how long polish keeps working, not whether it works at all. All three
 * are instruction-tuned, multilingual, and non-reasoning (a "thinking" variant would emit
 * chain-of-thought and violate the reply-with-only-the-text constraint).
 */
/**
 * Zero-cost model, so polish keeps working after the monthly credit allowance is gone.
 * A 2-bit ternary quant of Qwen3.6-27B — last in the ladder because that quantization is
 * lossy for nuanced correction, but free is better than no polish at all.
 */
export const FREE_TIER_POLISH_MODEL = 'prism-ml/Ternary-Bonsai-27B-gguf';

/**
 * Ordering is cheapest-capable first. HF's free tier is $0.10/month of credits (PRO: $2.00),
 * and polishing an hour of transcript costs ~$0.0005 on the head of this ladder — roughly
 * 200 hours/month on a free account — so cost only decides longevity, not viability. Each
 * entry also sits on a *different* provider (nscale / novita / deepinfra / together) so one
 * provider outage cannot take the feature down.
 */
export const POLISH_MODELS = [
  'Qwen/Qwen3-4B-Instruct-2507', // ~$0.01/$0.03 per M — nscale
  'meta-llama/Llama-3.1-8B-Instruct', // ~$0.02/$0.05 — novita
  'google/gemma-3-4b-it', // ~$0.05/$0.10 — deepinfra
  FREE_TIER_POLISH_MODEL, // $0 — together
] as const;

/**
 * Statuses that mean "this model/provider won't serve you" — worth trying the next candidate.
 * 402 is included: credits are per-account, but the ladder ends in a zero-cost model, so an
 * exhausted allowance should fall through to it. 401/403 (bad token) and 429 (rate limit)
 * fail identically on every candidate, so they abort the ladder immediately.
 */
function isModelUnavailable(status: number | undefined): boolean {
  if (status === undefined) return true; // opaque failure: CORS-stripped 503, DNS, offline
  return status === 400 || status === 402 || status === 404 || status === 422 || status >= 500;
}

/** Max characters per request. Keeps each block inside a small model's reliable context. */
const BLOCK_BUDGET = 3500;

/** Per-request timeout so a hung router cannot wedge the job (Reset is disabled mid-run). */
const REQUEST_TIMEOUT_MS = 60_000;

/**
 * Accept model output only when its length stays within these ratios of the input.
 * Outside the window means the model summarized, blanked, or rambled — keep the raw block.
 */
const MIN_LENGTH_RATIO = 0.5;
const MAX_LENGTH_RATIO = 2.0;

/**
 * Tuned for a weak model: imperative, forbids every observed failure mode, demands bare output.
 */
const SYSTEM_PROMPT =
  'You fix errors in speech-to-text transcripts. Correct punctuation, casing, ' +
  'and clearly mis-transcribed words using surrounding context. Keep the original ' +
  'language. Do NOT add, remove, summarize, translate, or reorder content. ' +
  'Reply with ONLY the corrected text — no explanations, no quotes, no preamble.';

export interface PolishOptions {
  token: string;
  onProgress?: (percent: number) => void;
  /** Injectable for tests; defaults to global fetch. */
  fetchImpl?: typeof fetch;
}

interface ChatCompletionResponse {
  choices?: Array<{ message?: { content?: string }; finish_reason?: string }>;
}

/**
 * Polish failure carrying the HTTP status when one was received.
 * `status` is undefined for network/CORS failures, which never reach a response.
 */
export class HfPolishError extends Error {
  readonly status?: number;

  constructor(message: string, status?: number) {
    super(message);
    this.name = 'HfPolishError';
    this.status = status;
  }
}

/**
 * Maps a polish failure to a single user-facing sentence. Pure — safe to call anywhere.
 */
export function describePolishFailure(error: unknown): string {
  const status = error instanceof HfPolishError ? error.status : undefined;

  let cause: string;
  if (status === 401 || status === 403) {
    cause = `Hugging Face rejected your token for AI cleanup (HTTP ${status}).`;
  } else if (status === 402) {
    cause = 'Your Hugging Face inference credits are used up (HTTP 402).';
  } else if (status === 429) {
    cause = 'Hugging Face rate limit reached during AI cleanup (HTTP 429).';
  } else if (status === 503) {
    cause = 'The AI cleanup model is loading or temporarily unavailable (HTTP 503).';
  } else if (status !== undefined) {
    cause = `AI cleanup request failed (HTTP ${status}).`;
  } else {
    // No status means no readable response: offline, or (commonly) an HF error response
    // returned without CORS headers, which the browser hides behind an opaque failure.
    cause =
      'Could not reach Hugging Face for AI cleanup — the service may be unavailable, or the request was blocked. Check your network connection.';
  }

  return `${cause} The transcript was left unpolished.`;
}

/**
 * Splits text into blocks of at most BLOCK_BUDGET characters, cutting only at sentence
 * boundaries (after `.`, `!`, `?`, `…`). A single sentence longer than the budget is
 * hard-split by characters (never inside a surrogate pair) so no content is dropped.
 *
 * Invariant: `blocks.join('')` reproduces the input byte-for-byte — blocks keep their
 * original whitespace, so the guardrail's keep-raw path cannot corrupt the transcript.
 */
export function splitIntoBlocks(text: string): string[] {
  if (text.length <= BLOCK_BUDGET) return [text];

  // Sentence = shortest run ending in terminal punctuation (+ trailing quotes/spaces),
  // or the unterminated tail of the text.
  const sentences = text.match(/[^.!?…]*[.!?…]+["')\]]*\s*|[^.!?…]+$/g) ?? [text];

  const blocks: string[] = [];
  let current = '';

  const hardSplit = (sentence: string) => {
    let i = 0;
    while (i < sentence.length) {
      let end = Math.min(i + BLOCK_BUDGET, sentence.length);
      // Step back if the cut would land between the halves of a surrogate pair.
      if (end < sentence.length && /[\uD800-\uDBFF]/.test(sentence[end - 1])) end--;
      blocks.push(sentence.slice(i, end));
      i = end;
    }
  };

  for (const sentence of sentences) {
    if (sentence.length > BLOCK_BUDGET) {
      if (current) {
        blocks.push(current);
        current = '';
      }
      hardSplit(sentence);
      continue;
    }
    if (current.length + sentence.length > BLOCK_BUDGET) {
      if (current) blocks.push(current);
      current = '';
    }
    current += sentence;
  }
  if (current) blocks.push(current);

  return blocks;
}

/**
 * Sends one block to one model. Throws HfPolishError (with the HTTP status when there was a
 * response) so the caller can decide between advancing the ladder and giving up.
 */
async function requestPolish(
  model: string,
  body: string,
  token: string,
  doFetch: typeof fetch
): Promise<ChatCompletionResponse> {
  let response: Response;
  try {
    response = await doFetch(HF_CHAT_ENDPOINT, {
      method: 'POST',
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        temperature: 0.2,
        // Corrected text is roughly input-sized. Budget ~1 token per char so non-Latin
        // scripts (CJK ≈ 1 token/char) are not silently truncated by the cap.
        max_tokens: Math.min(4096, body.length + 128),
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: body },
        ],
      }),
    });
  } catch (networkError) {
    // No response at all: offline, DNS, timeout, or a CORS-blocked error response
    // (the router's 503 path omits CORS headers, which hides the status from us).
    throw new HfPolishError(
      `HF polish request to ${model} could not complete: ${
        networkError instanceof Error ? networkError.message : String(networkError)
      }`
    );
  }

  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    throw new HfPolishError(
      `HF polish request to ${model} failed (${response.status}). ${detail}`.trim(),
      response.status
    );
  }

  try {
    return (await response.json()) as ChatCompletionResponse;
  } catch {
    throw new HfPolishError(
      `HF polish returned malformed JSON (${response.status}).`,
      response.status
    );
  }
}

/**
 * Polishes a transcript via the HF-hosted chat model, block by block in sequence.
 * Returns the corrected text; a block whose model output fails the sanity guardrail keeps
 * its raw text, and blocks are rejoined with '' (they carry their own whitespace) so the
 * unpolished parts survive byte-for-byte. Throws HfPolishError on any HTTP/network failure
 * so the caller can treat the whole pass as best-effort.
 */
export async function polishTranscript(text: string, options: PolishOptions): Promise<string> {
  const doFetch = options.fetchImpl ?? fetch;
  const blocks = splitIntoBlocks(text);

  /** Index into POLISH_MODELS; advances past candidates this account cannot reach. */
  let modelIndex = 0;
  const polished: string[] = [];
  for (let i = 0; i < blocks.length; i++) {
    const block = blocks[i];
    const reportProgress = () =>
      options.onProgress?.(Math.round(((i + 1) / blocks.length) * 100));

    // Whitespace-only blocks: nothing to polish, don't burn a request (and avoid a 0-length ratio).
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
    let lastError: HfPolishError | null = null;
    for (let m = modelIndex; m < POLISH_MODELS.length; m++) {
      try {
        data = await requestPolish(POLISH_MODELS[m], body, options.token, doFetch);
        modelIndex = m;
        lastError = null;
        break;
      } catch (error) {
        lastError = error instanceof HfPolishError ? error : new HfPolishError(String(error));
        if (!isModelUnavailable(lastError.status)) break;
        console.warn(
          `[VideoConverter] polish model ${POLISH_MODELS[m]} unavailable; trying next:`,
          lastError.message
        );
      }
    }
    if (!data) throw lastError ?? new HfPolishError('HF polish failed.');

    const choice = data.choices?.[0];
    const candidate = (choice?.message?.content ?? '').trim();

    // Guardrail: reject blanks, summaries/rambles (length ratio), and completions the
    // model did not finish (finish_reason 'length' = truncated → tail would be lost).
    const ratio = candidate.length / body.length;
    const sane =
      candidate.length > 0 &&
      ratio >= MIN_LENGTH_RATIO &&
      ratio <= MAX_LENGTH_RATIO &&
      choice?.finish_reason !== 'length';
    polished.push(sane ? lead + candidate + trail : block);

    reportProgress();
  }

  return polished.join('');
}
