---
title: 'Accept audio files as transcription source'
type: 'feature'
created: '2026-07-12'
status: 'done'
review_loop_iteration: 0
baseline_commit: '70ccd0da24905cddd75f9c473128154e89aac338'
context: []
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Transcription mode only accepts video files. The source gate `isValidVideoFile` rejects audio uploads (e.g. `podcast.mp3`) even though the FFmpeg WAV-normalize step and Whisper worker already handle audio-only input, so users cannot transcribe audio directly.

**Approach:** Introduce a mode-aware source validator. In `transcription` mode accept video AND common audio files; `video` and `audio-extraction` modes stay video-only. Thread the active `ConversionMode` into `FileDropZone` and update its accept filter, copy, and error text accordingly.

## Boundaries & Constraints

**Always:** Preserve existing video-only validation for `video` and `audio-extraction` modes. Keep `isValidVideoFile` intact (still used by video paths). FFmpeg/Whisper pipeline stays unchanged — this is a validation + UI-copy change only. Validation stays extension/MIME-based; FFmpeg remains the real decoder and surfaces actionable errors on unsupported streams.

**Ask First:** Adding audio support to `video` or `audio-extraction` modes (out of current scope). Changing the accepted audio extension set.

**Never:** No changes to the transcription pipeline (`extractPcmWav`, `getWavNormalizeCommand`, whisper worker, progress mapping). No new output formats. No content-sniffing/decoding for validation.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Audio in transcription | `podcast.mp3` selected, transcription mode | Accepted; convert enabled; transcribes to txt/srt/vtt | N/A |
| Video in transcription | `demo.mp4`, transcription mode | Accepted (unchanged) | N/A |
| Audio in video mode | `podcast.mp3`, video mode | Rejected | Video-only error copy shown |
| Audio in audio-extraction mode | `song.wav`, audio-extraction mode | Rejected (video-only, unchanged) | Video-only error copy shown |
| Unsupported file | `doc.pdf`, any mode | Rejected | Invalid-source error copy shown |
| Audio with no decodable stream | corrupt/empty audio in transcription | Passes gate; FFmpeg extract fails | Existing actionable FFmpeg error surfaced |

</frozen-after-approval>

## Code Map

- `src/utils/formatUtils.ts` -- home of `isValidVideoFile`; add `isValidAudioFile` + mode-aware `isValidSourceFile(file, mode)`.
- `src/components/FileDropZone.tsx` -- source gate at `processFile` (line 43), `accept` attr (line 101), and video-centric copy/error; make mode-aware.
- `src/components/ConverterCard.tsx` -- `hasValidSourceVideo` (line 74) and `<FileDropZone>` render (line 169); pass mode, use mode-aware validator.
- `src/hooks/useFileConverter.ts` -- `startConversion` guard (line 209) uses `isValidVideoFile`; switch to mode-aware validator.
- `src/__tests__/utils/formatUtils.test.ts` -- extend for the new validators.
- `src/__tests__/components/FileDropZone.test.tsx` / `ConverterCard.test.tsx` -- cover audio-accepted-in-transcription and audio-rejected-in-video.

## Tasks & Acceptance

**Execution:**
- [x] `src/utils/formatUtils.ts` -- add `isValidAudioFile(file)` (MIME `audio/*` or ext in mp3,wav,m4a,aac,ogg,oga,opus,flac,weba,wma), and `isValidSourceFile(file, mode)` returning `isValidVideoFile(file) || (mode==='transcription' && isValidAudioFile(file))` -- one gate all call sites share.
- [x] `src/components/FileDropZone.tsx` -- add optional `conversionMode?: ConversionMode` prop (defaults `'video'` to preserve existing callers/tests); use `isValidSourceFile(f, conversionMode)`; extend `accept` with `audio/*` + audio exts in transcription; make error text, heading, and supported-formats caption mode-aware -- so audio uploads are accepted and the UI stops claiming video-only.
- [x] `src/components/ConverterCard.tsx` -- rename `hasValidSourceVideo`→`hasValidSource` via `isValidSourceFile(job.file, job.conversionMode)`; pass `conversionMode={job.conversionMode}` to `FileDropZone` -- convert button enablement respects audio sources.
- [x] `src/hooks/useFileConverter.ts` -- `startConversion` guard uses `isValidSourceFile(job.file, job.conversionMode)` -- start is not blocked for valid audio in transcription.
- [x] `src/__tests__/utils/formatUtils.test.ts` -- unit-test the I/O matrix rows for `isValidAudioFile`/`isValidSourceFile` (audio accepted only in transcription; video always; pdf never).
- [x] `src/__tests__/components/FileDropZone.test.tsx` -- audio file accepted (onFileSelect fired) in transcription mode; rejected with error in video mode.

**Acceptance Criteria:**
- Given transcription mode, when the user selects/drops a common audio file, then it is accepted and conversion can start.
- Given video or audio-extraction mode, when the user selects an audio file, then it is rejected with a video-only error and conversion stays blocked.
- Given the existing video-input flows in any mode, when unchanged, then behavior and passing tests are preserved (no regression).

## Design Notes

`isValidSourceFile` centralizes the decision so all three runtime call sites (drop zone, start guard, button gate) agree — avoiding the drift risk of a shared global gate turned partly mode-aware. Transcription of `input.<ext>` → `getWavNormalizeCommand` (`-vn -ar 16000 -ac 1`) is already a no-op on audio-only streams, and `getOutputFileName('podcast.mp3', 'txt', 'transcription')` → `podcast.txt`, so no pipeline change is needed.

## Verification

**Commands:**
- `npm test -- formatUtils FileDropZone ConverterCard useFileConverter` -- expected: all pass, new audio cases green.
- `npm run lint` -- expected: clean.
- `npm run build` -- expected: standalone build succeeds (mode-aware prop types compile).

**Manual checks:**
- In transcription mode, drop an `.mp3`; confirm it is accepted, transcribes, and downloads a `.txt`/`.srt`/`.vtt`. Switch to video mode, try the same `.mp3`; confirm rejection with video-only error.

## Suggested Review Order

**Validation logic (entry point)**

- The single mode-aware gate — transcription adds audio, all else stays video-only.
  [`formatUtils.ts:119`](../../src/utils/formatUtils.ts#L119)

- Audio predicate: `audio/*` MIME or common audio extension.
  [`formatUtils.ts:107`](../../src/utils/formatUtils.ts#L107)

**Gate call sites (must all agree)**

- Start-conversion guard now mode-aware, blocking invalid audio.
  [`useFileConverter.ts:209`](../../src/hooks/useFileConverter.ts#L209)

- Convert-button enablement uses the shared gate.
  [`ConverterCard.tsx:74`](../../src/components/ConverterCard.tsx#L74)

- Drop-zone accept/reject at selection time.
  [`FileDropZone.tsx:51`](../../src/components/FileDropZone.tsx#L51)

**UI binding & copy**

- Mode flows into the drop zone from the card.
  [`ConverterCard.tsx:173`](../../src/components/ConverterCard.tsx#L173)

- Optional prop defaults to `'video'` — preserves existing callers.
  [`FileDropZone.tsx:21`](../../src/components/FileDropZone.tsx#L21)

- Accept filter and prompt/error copy go mode-aware.
  [`FileDropZone.tsx:113`](../../src/components/FileDropZone.tsx#L113)

**Tests**

- Validator matrix: audio only in transcription; video always; pdf never.
  [`formatUtils.test.ts:71`](../../src/__tests__/utils/formatUtils.test.ts#L71)

- Drop-zone: audio accepted in transcription, rejected in video.
  [`FileDropZone.test.tsx:54`](../../src/__tests__/components/FileDropZone.test.tsx#L54)
