---
baseline_commit: 049102bd9e470f015627bba99064fab4fd1af6cb
---

# Story 1.2: Convert source video to MP3 with fixed high-quality profile

Status: review

## Story

As a screencast creator,
I want conversion to always produce one MP3 file using a fixed profile,
so that I get consistent output quality without configuring codec settings.

## Acceptance Criteria

1. Given Audio Extraction Mode is active and a valid source video is selected, when the user starts conversion, then the system runs one conversion job that outputs exactly one MP3 file and the encoder target profile is fixed to CBR 320 kbps.
2. Given conversion is in progress, when FFmpeg emits progress and completion events, then the UI reflects loading/converting/done states with progress updates and conversion failures surface actionable error messages.

## Tasks / Subtasks

- [x] Add MP3 as a first-class output format contract (AC: 1)
  - [x] Extend VideoFormat union to include mp3.
  - [x] Add MP3 metadata to FORMAT_INFO with extension mp3 and MIME type audio/mpeg.
  - [x] Ensure supported-format helpers include MP3 where intended.
- [x] Implement deterministic MP3 transcode command path (AC: 1)
  - [x] Add MP3 branch in useFFmpeg command planning.
  - [x] Use fixed CBR 320 kbps profile (for example -vn -c:a libmp3lame -b:a 320k).
  - [x] Preserve existing fallback/attempt behavior for non-MP3 formats.
- [x] Ensure one input maps to exactly one MP3 output artifact (AC: 1)
  - [x] Keep single output file name assignment.
  - [x] Keep blob creation and output metadata path consistent for MP3.
- [x] Preserve progress/status/error behavior in orchestration flow (AC: 2)
  - [x] Keep useFileConverter status transitions: idle -> loading -> converting -> done|error.
  - [x] Ensure progress callback behavior still updates percentage during conversion.
  - [x] Ensure FFmpeg failure details remain actionable in UI error state.
- [x] Add/expand tests for MP3 flow (AC: 1, 2)
  - [x] Extend format utility tests for MP3 metadata and supported formats.
  - [x] Extend useFileConverter tests for MP3 conversion success path.
  - [x] Add focused tests for FFmpeg command generation and error propagation if introducing testable command helper functions.

## Dev Notes

### Technical Requirements

- Keep FFmpeg load fallback order unchanged: local MT -> local ST -> CDN MT -> CDN ST.
- Do not introduce user-facing quality controls in this story; bitrate is fixed.
- Keep conversion in-browser using existing ffmpeg wasm pipeline.
- Keep status and output metadata updates centralized in useFileConverter.

### Architecture Compliance

- AD-3: Preserve deterministic FFmpeg loading order and fallback behavior.
- AD-2: Keep lifecycle ownership in useFileConverter.
- AD-6: Keep format/type contracts centralized.
- AD-7: Do not alter prepared FFmpeg asset assumptions.

### Library/Framework Requirements

- @ffmpeg/ffmpeg ^0.12.15 APIs and event model.
- @ffmpeg/core and @ffmpeg/core-mt 0.12.6 assets remain expected local runtime artifacts.
- React 19 state update patterns; no direct DOM mutation for conversion state.

### File Structure Requirements

- Update: src/types/index.ts
- Update: src/utils/formatUtils.ts
- Update: src/hooks/useFFmpeg.ts
- Update: src/hooks/useFileConverter.ts (only if mode/output handling requires it)
- Add/Update tests:
  - src/__tests__/utils/formatUtils.test.ts
  - src/__tests__/hooks/useFileConverter.test.ts
  - optional new test file: src/__tests__/hooks/useFFmpeg.test.ts

### Testing Requirements

- Validate MP3 appears only where intended in format list.
- Validate output MIME and extension for MP3 path.
- Validate status/progress/error behavior remains intact through conversion lifecycle.
- Ensure no regressions in existing video format conversion tests/patterns.

### Previous Story Intelligence

- Story 1.1 is expected to establish explicit audio extraction mode and MP3-only selection UI.
- If Story 1.1 is not yet implemented, keep feature branch scoped and avoid breaking video-mode UX.

### Git Intelligence Summary

- Recent commits emphasize crop UX and preview correctness.
- High regression risk is in ConverterCard orchestration; avoid entangling MP3 engine logic with crop preview interactions.

### Latest Technical Information

- Next.js 16 App Router runtime patterns remain unchanged for client hooks/components.
- Existing FFmpeg wrapper strategy already uses retry command attempts; extend this pattern rather than replacing it.

### Project Structure Notes

- MP3 conversion capability should stay in engine layer (useFFmpeg) and surfaced through existing orchestration API.
- Keep presentation components format-agnostic where possible.

### References

- _bmad-output/planning-artifacts/epics.md (Epic 1, Story 1.2)
- _bmad-output/planning-artifacts/prds/prd-video-converter-2026-07-07/prd.md (Section 4.1 FR-3, Section 4.2 FR-6)
- _bmad-output/planning-artifacts/architecture/architecture-video-converter-2026-07-07/ARCHITECTURE-SPINE.md (AD-2, AD-3, AD-6, AD-7)
- _bmad-output/planning-artifacts/architecture/architecture-video-converter-2026-07-07/ARCHITECTURE.md (Sections 5, 6)
- src/hooks/useFFmpeg.ts
- src/hooks/useFileConverter.ts
- src/utils/formatUtils.ts
- src/types/index.ts

## Dev Agent Record

### Agent Model Used

GPT-5.3-Codex

### Debug Log References

- `npm test -- --runTestsByPath src/__tests__/hooks/useFFmpeg.test.ts src/__tests__/hooks/useFileConverter.test.ts src/__tests__/utils/formatUtils.test.ts`
- `npm test`
- `npm run lint` (pre-existing lint errors in unrelated files: src/components/CropPreviewPanel.tsx and src/components/SaveDestinationDialog.tsx)

### Completion Notes List

- Implemented deterministic MP3 command planning in a dedicated helper with a single fixed profile (`-vn -c:a libmp3lame -b:a 320k`).
- Kept non-MP3 command retry/fallback behavior unchanged for WebM and other video outputs.
- Preserved one-input to one-output artifact flow (single output filename, MIME mapping, blob generation, metadata propagation).
- Verified orchestration lifecycle and progress/error handling continuity through existing `useFileConverter` flow and added audio-mode MP3 conversion path coverage.
- Added targeted tests for MP3 format contracts, mode-specific supported formats, MP3 output naming, and FFmpeg command planning.

### File List

- _bmad-output/implementation-artifacts/1-2-convert-source-video-to-mp3-with-fixed-high-quality-profile.md
- src/hooks/ffmpegCommandPlanner.ts
- src/hooks/useFFmpeg.ts
- src/__tests__/hooks/useFFmpeg.test.ts
- src/__tests__/hooks/useFileConverter.test.ts
- src/__tests__/utils/formatUtils.test.ts

## Change Log

- 2026-07-07: Implemented Story 1.2 fixed-profile MP3 conversion path and expanded test coverage for MP3 flow and FFmpeg command planning.
