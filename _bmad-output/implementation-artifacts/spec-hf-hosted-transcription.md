---
title: 'HF hosted transcription with BYO token and local fallback'
type: 'feature'
created: '2026-07-13'
status: 'done'
review_loop_iteration: 0
baseline_commit: 'ee38ddc964ab44ec4e1a59922737fc84825ecd8e'
context: []
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Local `whisper-small` is device-limited. Users with a Hugging Face token should be able to transcribe via HF's hosted `whisper-large-v3` for better accuracy, without losing the offline/private local path.

**Approach:** Add a hosted transcription path that POSTs ~60s audio slices to the HF Inference API using a user-supplied token (stored in localStorage, entered in the transcription UI). Use it only when a token is present, the browser is online, and `translate` is off; otherwise — or on any hosted error — fall back automatically to the existing local worker. Reuse Story A's `onPartialText` streaming so blocks appear progressively on either path.

## Boundaries & Constraints

**Always:** Token is the user's own, kept in localStorage and sent browser→HF directly (no server proxy; works in all runtimes). Any hosted failure (no token, offline, non-2xx, CORS, network, parse) falls back to local and the user still gets a transcript. Final `text`/`chunks` and txt/srt/vtt output are identical in shape to the local path. Hosted requests send only `{ return_timestamps: true }`.

**Ask First:** Forwarding language/`translate` to hosted (HF `hf-inference` ASR does not expose them — hosted is auto-detect transcribe-only; `translate=true` routes to local). Changing the hosted model id.

**Never:** No server-side token storage or proxy. No blocking the local path behind hosted. No new output formats. Do not log or persist the token anywhere but localStorage.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Token + online + not translate | valid token set | Hosted path: per-segment POSTs, streamed blocks, final text+chunks | N/A |
| No token | token empty | Local worker path (unchanged) | N/A |
| Offline | `navigator.onLine === false` | Local worker path | N/A |
| translate = true | token set, translate on | Local worker path (hosted can't translate) | N/A |
| Hosted API errors mid-run | 401/429/5xx/CORS/network | Fall back to local worker; transcript still produced | warn logged; no user-facing crash |
| Hosted returns no chunks | `{ text }` only | Use text; chunks = [] (txt fine; srt/vtt degrade gracefully) | N/A |

</frozen-after-approval>

## Code Map

- `src/utils/audioUtils.ts` -- has `decodeWavToPcm16k`; add `encodePcm16kToWav(pcm)` → 16 kHz mono 16-bit WAV `Blob`.
- `src/utils/hfToken.ts` -- NEW: SSR-safe `getHfToken()`/`setHfToken()` over localStorage key `vf_hf_token`.
- `src/utils/hfTranscribe.ts` -- NEW: `transcribeViaHf(pcm, { token, onPartialText, onProgress, fetchImpl? })` → `{ text, chunks }`; slices 60s windows, base64-WAV POST per slice, offsets chunk timestamps, aggregates, throws on any failure.
- `src/hooks/useFileConverter.ts` -- transcription branch (~L233-256): pick hosted vs local, try/catch fallback, wire `onPartialText`/progress.
- `src/components/ConverterCard.tsx` -- transcription options block (~L245-285): add HF token field + "audio is uploaded" note.
- `README.md`, `CLAUDE.md` -- document the hosted path uploads audio (breaks 100%-client-side for that path only).

## Tasks & Acceptance

**Execution:**
- [x] `src/utils/audioUtils.ts` -- add `encodePcm16kToWav(pcm: Float32Array): Blob` writing a canonical 44-byte PCM WAV header (mono, 16 kHz, 16-bit) + clamped int16 samples -- provides per-slice audio bytes for HF.
- [x] `src/utils/hfToken.ts` -- `getHfToken()`/`setHfToken(token)` guarded by `typeof window` so SSR/build never throws -- token persistence.
- [x] `src/utils/hfTranscribe.ts` -- `transcribeViaHf`: for each 60s PCM slice, `encodePcm16kToWav` → base64 → `POST https://router.huggingface.co/hf-inference/models/openai/whisper-large-v3` with `Authorization: Bearer <token>`, JSON body `{ inputs, parameters: { return_timestamps: true } }`; on non-ok throw; parse `{ text, chunks }`, add slice offset to each `timestamp`, accumulate, call `onPartialText(accumulated)` and `onProgress`; return `{ text, chunks }` -- the hosted engine.
- [x] `src/hooks/useFileConverter.ts` -- after `decodeWavToPcm16k`, compute `useHosted = !!getHfToken() && navigator.onLine && !job.transcriptionTranslate`; if hosted, `try transcribeViaHf(...) catch → local transcribe(...)`; else local; both feed `onPartialText`; keep `buildTranscriptOutput` from the resulting text+chunks -- orchestration + fallback.
- [x] `src/components/ConverterCard.tsx` -- in the transcription options, add a password `TextField` bound to `getHfToken()`/`setHfToken`, helper text linking to HF token settings and warning that audio is uploaded when a token is set -- BYO-token entry.
- [x] `README.md` + `CLAUDE.md` -- note the optional hosted path uploads audio to Hugging Face (privacy/offline caveat), local remains default.
- [x] `src/__tests__/utils/audioUtils.test.ts` -- `encodePcm16kToWav`: RIFF/WAVE header fields, byte length = 44 + 2*samples, sample clamping.
- [x] `src/__tests__/utils/hfToken.test.ts` -- set/get round-trip; empty when unset.
- [x] `src/__tests__/utils/hfTranscribe.test.ts` -- injected `fetchImpl`: success aggregates text + offsets timestamps + fires `onPartialText`; non-ok response throws.
- [x] `src/__tests__/hooks/useFileConverter.test.ts` -- mock `hfTranscribe`/`hfToken`: hosted used when token+online+!translate; falls back to local on hosted throw; local when no token; local when translate.

**Acceptance Criteria:**
- Given a token is set, the browser is online, and translate is off, when transcription runs, then audio is sent to HF hosted and the transcript streams in block-by-block.
- Given no token, or offline, or translate on, when transcription runs, then the local worker path is used and behavior matches today.
- Given the hosted request fails for any reason, when transcription runs, then it falls back to local and still produces a transcript without a user-facing error.
- Given either path completes, then `transcriptText`/`transcriptChunks` and txt/srt/vtt output match the existing shape and all prior tests pass.

## Design Notes

Token read lazily via `getHfToken()` at `startConversion` (no prop drilling; testable in jsdom). Hosted body must be JSON+base64 because `parameters` (timestamps) and raw-bytes payloads are mutually exclusive in the HF API. `transcribeViaHf` takes an injectable `fetchImpl` so tests avoid real network. CORS from `router.huggingface.co` is unverified — the try/catch fallback makes a CORS rejection behave like any other hosted failure (silent degrade to local), so the feature is safe to ship before that smoke-test.

## Verification

**Commands:**
- `npm test -- audioUtils hfToken hfTranscribe useFileConverter` -- expected: pass incl. new hosted + fallback tests.
- `npm test` -- expected: full suite green.
- `npm run lint` -- expected: clean on changed files.
- `npm run build && npm run build:desktop:web` -- expected: both build modes compile (SSR-safe token access).

**Manual checks:**
- Set a real HF token, transcribe a file: confirm it uses hosted (network call to router.huggingface.co) and streams blocks. Clear the token: confirm local path. Kill network mid-run with a token set: confirm graceful fallback to local.

## Suggested Review Order

**Orchestration (entry point)**

- The decision + fallback: hosted vs local, try/catch degrade.
  [`useFileConverter.ts:273`](../../src/hooks/useFileConverter.ts#L273)

**Hosted engine**

- Per-slice POST to the HF router with bearer token + timestamps.
  [`hfTranscribe.ts:56`](../../src/utils/hfTranscribe.ts#L56)

- WAV bytes for each slice (helper avoids `Blob.arrayBuffer`).
  [`audioUtils.ts:57`](../../src/utils/audioUtils.ts#L57)

- Token persistence, SSR-safe.
  [`hfToken.ts:7`](../../src/utils/hfToken.ts#L7)

**UI**

- Password token field + "audio is uploaded" note; lazy client-only init.
  [`ConverterCard.tsx:307`](../../src/components/ConverterCard.tsx#L307)

**Docs & tests**

- Client-side-first caveat updated.
  [`CLAUDE.md`](../../CLAUDE.md)

- Hosted/fallback branch matrix.
  [`useFileConverter.test.ts:236`](../../src/__tests__/hooks/useFileConverter.test.ts#L236)

- Hosted engine: aggregation, offsets, throw-on-error.
  [`hfTranscribe.test.ts:1`](../../src/__tests__/utils/hfTranscribe.test.ts#L1)
