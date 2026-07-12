---
title: 'Stream transcript text per segment during transcription'
type: 'feature'
created: '2026-07-13'
status: 'done'
review_loop_iteration: 0
baseline_commit: '20f65684046f081848a47676b73d035dd1c9f4bf'
context: []
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** During transcription the user sees only a percentage bar; the transcript appears all at once at the end. That feels dead on long audio. The worker already transcribes in 60s segments, so partial text exists mid-run but is withheld.

**Approach:** After each segment, the whisper worker emits the accumulated transcript text. `useTranscriber` forwards it through a new `onPartialText` callback; `useFileConverter` writes it into `job.transcriptText` while `status === 'converting'`. The already-rendered `TranscriptPanel` then fills in block-by-block, with a small "transcribing" indicator while streaming. Local worker path only.

## Boundaries & Constraints

**Always:** Preserve the final `result` behavior — completed `transcriptText`, `transcriptChunks`, txt/srt/vtt output, and the existing progress percent are unchanged. Partial text is display-only; serialization/output still derives from the final result. Worker posts accumulated full text (idempotent replace), not deltas.

**Ask First:** Token-by-token (intra-segment) streaming — out of scope here (per-segment blocks only). Streaming for the future HF hosted path (deferred Story B).

**Never:** No change to segmentation, model/dtype, timestamps, or the FFmpeg step. No new output formats. Do not gate output serialization on the transient partial text.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| First segment done | worker posts partial "Hello" | `transcriptText` = "Hello" during `converting`; panel visible with text | N/A |
| Later segment | partial "Hello world" | panel text updates to accumulated string | N/A |
| Completion | final `result` | `transcriptText` = full text; status `done`; streaming indicator hidden | N/A |
| All-silence file | no text emitted | panel stays hidden; percent still advances; ends `done` | N/A |
| Segment decode fails | one window throws | prior partial text retained; streaming continues to next block | worker warns; no UI break |

</frozen-after-approval>

## Code Map

- `src/workers/whisper.worker.ts` -- segment loop (~L190-203); add `transcribe-partial` outbound + post accumulated `fullText` per segment.
- `src/hooks/useTranscriber.ts` -- `TranscribeOptions` + message switch; add `onPartialText` handling.
- `src/hooks/useFileConverter.ts` -- transcription branch (~L244); pass `onPartialText` that sets `transcriptText` live.
- `src/components/TranscriptPanel.tsx` -- accept optional `streaming?: boolean`; render a subtle indicator.
- `src/components/ConverterCard.tsx` -- pass `streaming={job.status === 'converting'}` to `TranscriptPanel` (~L300).
- `src/__tests__/hooks/useFileConverter.test.ts` -- extend option assertions; add live-partial test.
- `src/__tests__/components/TranscriptPanel.test.tsx` -- new; text render + streaming indicator.

## Tasks & Acceptance

**Execution:**
- [x] `src/workers/whisper.worker.ts` -- add `{ type: 'transcribe-partial'; id: number; text: string }` to `WorkerOutbound`; after appending each segment's text, `postMessage` the accumulated `fullText` -- so partial transcript is available mid-run.
- [x] `src/hooks/useTranscriber.ts` -- add `onPartialText?: (text: string) => void` to `TranscribeOptions`; in the message switch, on `transcribe-partial` call `options.onPartialText?.(message.text)` -- bridge worker → caller.
- [x] `src/hooks/useFileConverter.ts` -- in the transcription branch pass `onPartialText: (text) => setJob((prev) => (prev.status === 'converting' ? { ...prev, transcriptText: text } : prev))` -- live update without clobbering terminal states.
- [x] `src/components/TranscriptPanel.tsx` -- add optional `streaming?: boolean`; when true show a small pulsing "Transcribing…" indicator in the header (panel still returns null when text is empty) -- signals live progress.
- [x] `src/components/ConverterCard.tsx` -- pass `streaming={job.status === 'converting'}` to `TranscriptPanel` -- indicator only during active transcription.
- [x] `src/__tests__/hooks/useFileConverter.test.ts` -- add `onPartialText: expect.any(Function)` to the two `mockTranscribe` option assertions; add a test where `mockTranscribe` invokes `onPartialText('partial…')` and asserts `job.transcriptText` reflects it.
- [x] `src/__tests__/components/TranscriptPanel.test.tsx` -- render with text (visible), without text (null), and with `streaming` (indicator present).

**Acceptance Criteria:**
- Given a transcription is running, when a segment finishes, then its accumulated text is shown in the transcript panel before the job reaches `done`.
- Given `status === 'converting'` with partial text, then a streaming indicator is visible; given `status === 'done'`, then the indicator is absent and `transcriptText` equals the final full text.
- Given the existing completion flow, when transcription finishes, then `transcriptText`, `transcriptChunks`, and txt/srt/vtt output match today's behavior (no regression) and all existing tests pass.

## Design Notes

`TranscriptPanel` is already mounted whenever `isTranscriptionMode` and renders `job.transcriptText`, so streaming needs no new view wiring — only live state. Posting the accumulated `fullText` (not deltas) keeps the handler a idempotent replace. Guarding the `onPartialText` setter on `status === 'converting'` prevents a late worker message from resurrecting text after reset/error. The final `result` still overwrites `transcriptText` identically, so output serialization is untouched.

## Verification

**Commands:**
- `npm test -- useFileConverter TranscriptPanel` -- expected: pass, incl. new live-partial + indicator tests.
- `npm test` -- expected: full suite green (no regression).
- `npm run lint` -- expected: clean on changed files.
- `npm run build` -- expected: worker + TypeScript compile.

**Manual checks:**
- Transcribe a multi-minute file locally; confirm transcript fills block-by-block during processing and the "Transcribing…" indicator shows, then clears at completion.

## Suggested Review Order

**Data flow (entry point)**

- The producer: worker emits accumulated transcript after each segment.
  [`whisper.worker.ts:200`](../../src/workers/whisper.worker.ts#L200)

- New non-terminal message in the worker→hook contract.
  [`whisper.worker.ts:35`](../../src/workers/whisper.worker.ts#L35)

- Bridge: hook forwards the partial to the caller.
  [`useTranscriber.ts:70`](../../src/hooks/useTranscriber.ts#L70)

- Consumer: live-writes `transcriptText`, guarded on `converting`.
  [`useFileConverter.ts:253`](../../src/hooks/useFileConverter.ts#L253)

**UI binding**

- Panel gains an optional streaming indicator.
  [`TranscriptPanel.tsx:42`](../../src/components/TranscriptPanel.tsx#L42)

- Card wires the indicator to active transcription only.
  [`ConverterCard.tsx:302`](../../src/components/ConverterCard.tsx#L302)

**Tests**

- Live-partial drives `transcriptText`; option contract updated.
  [`useFileConverter.test.ts:208`](../../src/__tests__/hooks/useFileConverter.test.ts#L208)

- Panel: text render, null render, streaming indicator.
  [`TranscriptPanel.test.tsx:1`](../../src/__tests__/components/TranscriptPanel.test.tsx#L1)
