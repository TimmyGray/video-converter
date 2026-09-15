---
title: 'Use multiple hosted free-provider fallbacks for transcript polish'
type: 'feature'
created: '2026-09-15'
status: 'done'
route: 'oneshot'
review_loop_iteration: 0
context: []
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** AI transcript polish currently falls through models that are routed through paid or credit-limited Hugging Face providers, so a free account can receive HTTP 402 after a small number of requests. The existing terminal fallback is not a reliable zero-cost hosted fallback.

**Approach:** Replace the polish model ladder with multiple instruction-tuned models currently exposed through Hugging Face's Public AI provider, selecting that provider explicitly in each model id. Keep the existing best-effort behavior, block processing, output guardrails, and raw-transcript preservation unchanged.

</frozen-after-approval>

## Implementation Notes

- Update `src/utils/hfPolish.ts` so the hosted ladder uses `swiss-ai/Apertus-8B-Instruct-2509:publicai` first and `speakleash/Bielik-11B-v3.0-Instruct:publicai` second; do not add Transformers.js or any dependency.
- Preserve the existing 402/5xx fallback semantics and request endpoint. The explicit provider suffix is supported by the HF OpenAI-compatible router.
- Update `src/__tests__/utils/hfPolish.test.ts` to assert the new model ids/provider suffixes and that unavailable candidates advance through the ladder.
- Synchronize the hosted-polish description in `CLAUDE.md` with the new provider-explicit ladder and its pricing caveat.
- No changes to transcription, transcript chunks, UI, token handling, or output formats.

- Implemented the two Public AI candidates and retained the existing sequential fallback, 402 handling, and request contract.
- 403 now advances to the next candidate because it can indicate model-gated access rather than an invalid token; 401 and 429 remain terminal token/rate-limit errors.
- Updated unit assertions and the repository architecture note; no new dependency or runtime path was added.
- Updated README privacy wording to include the transcript-text upload performed by optional polish.
- Disclosed Public AI as the inference provider in the token helper, with a link to its Terms and Privacy.

## Review Triage Log

- defer -- both candidates use Public AI; an independent free provider requires separate pricing/API-key validation and would expand the free-only scope.
- fixed -- README previously described hosted transcription as the only off-device path and omitted that optional polish uploads transcript text; it now documents both hosted uploads.
- fixed -- 403 from a gated fallback model previously surfaced as a terminal token error; the ladder now advances to the next candidate and the final message distinguishes token rejection from model access rejection.
- fixed -- the UI and README now name Public AI as the polish provider and link its Terms and Privacy for the transcript-text upload.
- false -- a credentialed live-provider smoke test is an environment/release check, not a unit-test defect; no real HF token was available for this run.
- defer -- the response-preamble guardrail predates this provider change and is recorded separately as polish hardening work.
