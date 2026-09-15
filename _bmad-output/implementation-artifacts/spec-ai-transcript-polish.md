---
title: 'AI post-processing polish of finished transcripts via HF hosted chat model'
type: 'feature'
created: '2026-07-23'
status: 'done'
review_loop_iteration: 0
baseline_commit: 'af673f33dee6581e7bba276007e5587e7974b2bc'
context: []
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Whisper output contains many deviations — wrong words, broken punctuation/casing. Users need a context-aware cleanup pass, but the transcription models themselves can't provide it.

**Approach:** After transcription completes, send the full transcript text to a free HF-hosted instruct model (browser → HF directly) with a tightly constrained correction prompt, and replace the plain-text transcript with the polished version. Runs **only when the user's HF token is set**; any failure is non-blocking — the raw transcript survives and a notice explains what happened. Polish applies to plain text only (panel + `txt` output); `srt`/`vtt` keep raw timestamped chunks.

## Boundaries & Constraints

**Always:**
- Browser → HF directly, no server proxy (must work in all three runtimes).
- Polish is best-effort: any failure leaves the raw transcript intact, job still reaches `done`.
- Prompt engineered for a small/weak model: strict "correct only, never add/remove/summarize/translate" instructions + output-sanity guardrails, since the model cannot be trusted to follow instructions reliably.
- New HF-call module stays pure (no React/side effects), unit-tested in isolation.

**Ask First:**
- Changing the trigger conditions (token + online + non-empty transcript).
- Adding any paid or non-HF provider.

**Never:**
- Polish `srt`/`vtt` chunks or touch `transcriptChunks`/timestamps.
- Call HF without a user token, or block/ fail the transcription job because polish failed.
- New npm dependencies.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Happy path | token set, online, transcript non-empty | polished text in panel + `txt` output; chunks untouched | N/A |
| No token | token empty | polish never attempted, no HF request | N/A |
| Offline | `navigator.onLine === false` | polish skipped silently | N/A |
| HTTP 401/403/429/5xx | HF rejects a request | raw text kept, warning notice with status-specific reason, job `done` | catch → notice, no throw |
| Model misbehaves | block output empty or length ratio outside [0.5, 2.0] | that block keeps its raw text | guardrail, no error |
| Long transcript | text > block budget | split at sentence boundaries into sequential requests, per-block progress | per-request failure → whole polish aborts to notice |
| Empty transcript | `text` is '' | polish skipped silently | N/A |

</frozen-after-approval>

## Code Map

- `src/utils/hfPolish.ts` -- NEW: pure module; `polishTranscript()`, `HfPolishError` (carries HTTP status), `describePolishFailure()`
- `src/utils/hfTranscribe.ts` -- pattern reference: `HfTranscribeError`/`describeHfFailure` (mirror, don't reuse — suffixes differ)
- `src/hooks/useFileConverter.ts` -- transcription branch: insert polish phase after transcribe result, before `buildTranscriptOutput`; progress rescale; `polishNotice` lifecycle
- `src/types/index.ts` -- `ConversionJob` + `polishNotice: string | null`
- `src/components/ConverterCard.tsx` -- render polish notice `Alert` (pattern: `hosted-transcription-notice` at L340)
- `src/utils/subtitleUtils.ts` -- no change; seam guarantee: `txt` from `text`, `srt`/`vtt` from `chunks`
- `src/__tests__/utils/hfPolish.test.ts`, `src/__tests__/hooks/useFileConverter.test.ts`, `src/__tests__/components/ConverterCard.test.tsx` -- tests

## Tasks & Acceptance

**Execution:**
- [x] `src/__tests__/utils/hfPolish.test.ts` -- NEW, red-first -- request shape (endpoint/model/auth/temperature), sentence-boundary blocking, length guardrail, error status, `describePolishFailure` variants incl. "left unpolished" suffix
- [x] `src/utils/hfPolish.ts` -- NEW -- POST `https://router.huggingface.co/v1/chat/completions` (OpenAI-compatible HF Inference Providers router, free credits with any HF token), model constant `MODEL = 'Qwen/Qwen2.5-7B-Instruct'` (fast free-tier instruct, multilingual, strong constraint-following for its size), `temperature: 0.2`, `max_tokens` sized to block; system prompt per Design Notes; blocks ≤ ~3500 chars split at sentence boundaries; per-block length guardrail; `onProgress(percent)`; injectable `fetchImpl`
- [x] `src/types/index.ts` -- add `polishNotice` -- non-fatal warning surface, mirrors `hostedTranscriptionNotice`
- [x] `src/__tests__/hooks/useFileConverter.test.ts` -- red-first -- polish applied → `transcriptText` + `txt` output polished, chunks raw; no-token → `polishTranscript` not called; polish failure → raw text, notice set, status `done`; notice cleared on new run/reset
- [x] `src/hooks/useFileConverter.ts` -- integrate -- when `token && online && text`, rescale transcription progress to 0–90 (multiply existing mapped values by 0.9) and run polish 90→100; on failure set `polishNotice = describePolishFailure(err)` and keep raw text; reset `polishNotice` in `startConversion`/`initialJob`
- [x] `src/__tests__/components/ConverterCard.test.tsx` -- red-first -- notice renders during/after job, absent when null
- [x] `src/components/ConverterCard.tsx` -- second outlined warning `Alert`, `data-testid="transcript-polish-notice"`, next to the hosted notice

**Acceptance Criteria:**
- Given a set token and a finished transcription, when polish succeeds, then the panel and `txt` download contain the polished text while `srt`/`vtt` cues are byte-identical to the unpolished run.
- Given a set token, when every polish request fails, then the job still completes with the raw transcript and one status-specific warning notice.
- Given no token, when transcription completes, then no polish request is made and no notice appears.
- Given polish is running, when the user watches progress, then the bar never moves backwards and reaches 100 only after polish resolves.

## Design Notes

System prompt (EN, verbatim start point — tuned for a weak model; keep imperative, forbid meta-output):
```
You fix errors in speech-to-text transcripts. Correct punctuation, casing,
and clearly mis-transcribed words using surrounding context. Keep the original
language. Do NOT add, remove, summarize, translate, or reorder content.
Reply with ONLY the corrected text — no explanations, no quotes, no preamble.
```
User message = raw block text. Guardrail exists because a weak model *will* occasionally ignore the prompt: reject block output that is empty or whose length ratio vs input falls outside [0.5, 2.0] → keep raw block. Progress rescale (not append) avoids the backwards-bar bug documented in the hosted-fallback work.

## Spec Change Log

## Verification

**Commands:**
- `npx jest hfPolish useFileConverter ConverterCard` -- expected: all green, new tests confirmed red before implementation
- `npm test` -- expected: full suite green
- `npm run lint` -- expected: 0 errors, no new warnings in touched files
- `npm run build && npm run build:desktop:web` -- expected: both modes compile

## Suggested Review Order

**Polish pipeline integration (design intent)**

- Entry point: trigger decision + 0–90/90–100 progress compression rationale
  [`useFileConverter.ts:262`](../../src/hooks/useFileConverter.ts#L262)
- Polish phase: best-effort call, notice on failure, raw text kept
  [`useFileConverter.ts:339`](../../src/hooks/useFileConverter.ts#L339)

**HF chat module (pure)**

- Model/prompt constants — the weak-model constraints live here
  [`hfPolish.ts:7`](../../src/utils/hfPolish.ts#L7)
- Sequential per-block loop, timeout signal, CJK-safe max_tokens
  [`hfPolish.ts:134`](../../src/utils/hfPolish.ts#L134)
- Sanity guardrail: length ratio + finish_reason truncation check
  [`hfPolish.ts:197`](../../src/utils/hfPolish.ts#L197)
- Byte-exact block splitting (sentence boundaries, surrogate-safe hard split)
  [`hfPolish.ts:86`](../../src/utils/hfPolish.ts#L86)
- Failure → user-facing message mapping
  [`hfPolish.ts:59`](../../src/utils/hfPolish.ts#L59)

**Race hardening (review finding)**

- runId invalidation: reset during any await stops all late state writes
  [`useFileConverter.ts:109`](../../src/hooks/useFileConverter.ts#L109)
- Run start captures its id; every await checks staleness after
  [`useFileConverter.ts:229`](../../src/hooks/useFileConverter.ts#L229)

**UI + disclosure**

- Non-blocking polish warning banner
  [`ConverterCard.tsx:362`](../../src/components/ConverterCard.tsx#L362)
- Token helper text now discloses transcript-text upload
  [`ConverterCard.tsx:309`](../../src/components/ConverterCard.tsx#L309)
- Privacy contract updated: two token-gated upload paths
  [`CLAUDE.md:9`](../../CLAUDE.md#L9)

**Peripherals**

- New job field
  [`types/index.ts:70`](../../src/types/index.ts#L70)
- Module tests incl. byte-preservation and guardrail cases
  [`hfPolish.test.ts:1`](../../src/__tests__/utils/hfPolish.test.ts#L1)
- Hook tests incl. reset-race regression coverage
  [`useFileConverter.test.ts:1`](../../src/__tests__/hooks/useFileConverter.test.ts#L1)
