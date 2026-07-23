const HF_CHAT_ENDPOINT = 'https://router.huggingface.co/v1/chat/completions';

/**
 * Free-tier instruct model on the HF Inference Providers router. Chosen for speed,
 * multilingual coverage, and constraint-following at its size — swap here if it degrades.
 */
const MODEL = 'Qwen/Qwen2.5-7B-Instruct';

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
  } else if (status === 429) {
    cause = 'Hugging Face rate limit reached during AI cleanup (HTTP 429).';
  } else if (status === 503) {
    cause = 'The AI cleanup model is loading or temporarily unavailable (HTTP 503).';
  } else if (status !== undefined) {
    cause = `AI cleanup request failed (HTTP ${status}).`;
  } else {
    cause = 'Could not reach Hugging Face for AI cleanup — check your network connection.';
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
 * Polishes a transcript via the HF-hosted chat model, block by block in sequence.
 * Returns the corrected text; a block whose model output fails the sanity guardrail keeps
 * its raw text, and blocks are rejoined with '' (they carry their own whitespace) so the
 * unpolished parts survive byte-for-byte. Throws HfPolishError on any HTTP/network failure
 * so the caller can treat the whole pass as best-effort.
 */
export async function polishTranscript(text: string, options: PolishOptions): Promise<string> {
  const doFetch = options.fetchImpl ?? fetch;
  const blocks = splitIntoBlocks(text);

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

    const response = await doFetch(HF_CHAT_ENDPOINT, {
      method: 'POST',
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      headers: {
        Authorization: `Bearer ${options.token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: MODEL,
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

    if (!response.ok) {
      const detail = await response.text().catch(() => '');
      throw new HfPolishError(
        `HF polish request failed (${response.status}). ${detail}`.trim(),
        response.status
      );
    }

    let data: ChatCompletionResponse;
    try {
      data = (await response.json()) as ChatCompletionResponse;
    } catch {
      throw new HfPolishError(
        `HF polish returned malformed JSON (${response.status}).`,
        response.status
      );
    }
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
