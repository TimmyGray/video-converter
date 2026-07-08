# Story 1.5: Protect build-mode and regression safety for audio extraction

Status: review

## Story

As a maintainer,
I want audio extraction changes to remain compatible with both standalone and export build modes,
so that release and desktop packaging flows continue to work after this feature lands.

## Acceptance Criteria

1. Given the audio extraction feature implementation is complete, when project validation is run, then npm run lint, npm test, npm run build, and npm run build:desktop:web pass and existing non-audio conversion formats remain functional.
2. Given src/app/api/native-save/route.ts participates in runtime save flow, when feature changes are reviewed, then route segment config exports remain static literals and export-mode capability gating remains inside handler logic.

## Tasks / Subtasks

- [x] Execute and document full validation matrix (AC: 1)
  - [x] Run npm run lint.
  - [x] Run npm test.
  - [x] Run npm run build.
  - [x] Run npm run build:desktop:web.
  - [x] If desktop packaging behavior changed, run npm run tauri:build. (N/A — no desktop packaging/Rust changes in this story.)
  - [x] Capture command outcomes in completion notes.
- [x] Add focused regression coverage for audio mode vs existing formats (AC: 1)
  - [x] Add tests ensuring non-audio formats still appear and convert in normal video mode.
  - [x] Add tests ensuring audio-mode constraints do not leak into normal video-mode behavior.
- [x] Enforce route config and export-guard constraints (AC: 2)
  - [x] Keep runtime and dynamic exports static literals in src/app/api/native-save/route.ts.
  - [x] Keep export/standalone branching inside GET/POST handlers.
  - [x] Ensure no conditional expression is introduced in route segment config exports.
- [x] Validate build mode contract remains environment-driven (AC: 1, 2)
  - [x] Keep NEXT_OUTPUT_MODE contract in next.config.ts.
  - [x] Ensure release and desktop scripts remain aligned with FFmpeg asset preparation and output targets.
- [x] Validate FFmpeg asset preparation assumptions (AC: 1)
  - [x] If builds fail on FFmpeg core availability, run prepare:ffmpeg-assets and confirm assets exist in public/ffmpeg-core and public/ffmpeg-core-mt.

## Dev Notes

### Technical Requirements

- This story is a quality and release safety gate across all prior stories.
- Validation is not complete until both standalone and export build paths are verified.
- Non-audio flows must remain functional; no feature may regress existing conversion formats.

### Architecture Compliance

- AD-1: Build mode remains environment-driven via NEXT_OUTPUT_MODE.
- AD-5: Route segment config exports are static literals; handler-level gating for export behavior.
- AD-7: FFmpeg assets must be prepared before production builds.
- AD-8: Tauri desktop consumes exported frontend output.

### Library/Framework Requirements

- Next.js 16 dual output mode behavior.
- Existing scripts in package.json are source of truth for validation commands.
- Tauri build wiring in src-tauri/tauri.conf.json must continue to point frontendDist to ../out.

### File Structure Requirements

- Verify (and update only if needed):
  - next.config.ts
  - src/app/api/native-save/route.ts
  - package.json
  - scripts/prepare-ffmpeg-assets.mjs
  - scripts/create-release.mjs
  - src-tauri/tauri.conf.json
- Add/update regression tests under src/__tests__/components/ and src/__tests__/hooks/ as needed.

### Testing Requirements

- Must pass:
  - npm run lint
  - npm test
  - npm run build
  - npm run build:desktop:web
- If affected:
  - npm run tauri:build
- Regression checks:
  - verify normal video conversion path still supports existing formats
  - verify audio mode does not alter video mode defaults
  - verify native-save route behavior remains export-safe

### Previous Story Intelligence

- Stories 1.1-1.4 modify cross-cutting areas (mode UX, engine format support, naming, save adapters).
- This story must verify that these combined changes preserve existing behavior and release workflows.

### Git Intelligence Summary

- Recent regression fixes included route static-config issues and runtime save gating.
- Build and runtime guardrails have prior incident history and must be explicitly re-validated before merge.

### Latest Technical Information

- Next App Router requires route segment config to be statically analyzable.
- Static export mode cannot serve active API routes; endpoint capability should return unavailable in export mode.

### Project Structure Notes

- Keep release validation commands and scripts aligned with existing AGENTS guidance.
- Treat .github/instructions/build-modes-and-runtime-guards.instructions.md as the build/runtime source of truth for this story.

### References

- _bmad-output/planning-artifacts/epics.md (Epic 1, Story 1.5)
- _bmad-output/planning-artifacts/architecture/architecture-video-converter-2026-07-07/ARCHITECTURE-SPINE.md (AD-1, AD-5, AD-7, AD-8)
- _bmad-output/planning-artifacts/architecture/architecture-video-converter-2026-07-07/ARCHITECTURE.md (Sections 3, 8, 12)
- .github/instructions/build-modes-and-runtime-guards.instructions.md
- AGENTS.md (Pre-PR checks and runtime constraints)
- agent-learnings.md (route config static literal, save path gating)
- next.config.ts
- src/app/api/native-save/route.ts
- package.json
- scripts/prepare-ffmpeg-assets.mjs
- scripts/create-release.mjs
- src-tauri/tauri.conf.json

## Dev Agent Record

### Agent Model Used

Claude Opus 4.8

### Debug Log References

- N/A

### Completion Notes List

- Validation matrix (all green on branch story/1-5-build-mode-regression-safety):
  - `npm run lint` → exit 0 (0 errors, 0 warnings).
  - `npm test` → 14 suites / 105 tests passing.
  - `npm run build` (standalone) → exit 0; `/api/native-save` server-rendered on demand.
  - `npm run build:desktop:web` (NEXT_OUTPUT_MODE=export) → exit 0; `out/` generated for Tauri `frontendDist: ../out`; native-save correctly omitted from static export (export-safe).
  - `npm run tauri:build` → N/A (no Rust/desktop packaging changes in this story).
- Fixed pre-existing lint failures gating AC-1 without changing runtime behavior:
  - Excluded vendored, gitignored FFmpeg WASM glue (`public/ffmpeg-core/**`, `public/ffmpeg-core-mt/**`) from ESLint in `eslint.config.mjs`; these are minified third-party assets prepared by `scripts/prepare-ffmpeg-assets.mjs` (AD-7).
  - Added two targeted, justified `react-hooks/set-state-in-effect` disables for intentional prop-sync effects in `CropPreviewPanel.tsx` and `SaveDestinationDialog.tsx` (reset-on-prop-change + async capability/frame probing). No behavior change.
- Added regression coverage:
  - `src/__tests__/hooks/ffmpegCommandPlanner.test.ts` — locks the command contract: `-vn`/`libmp3lame`/`320k` stays isolated to mp3, crop never leaks into audio, video formats never strip audio, crop applies to all video formats, webm stream-copy fast path only when uncropped.
  - `ConverterCard.test.tsx` — video mode exposes all six non-audio formats and keeps crop controls (audio constraints do not leak into video mode).
  - `useFileConverter.test.ts` — mp3-only constraint applies only in audio mode; all video formats selectable in video mode; crop settings survive an audio round-trip.
- Verified route/build-mode invariants (AC: 2) unchanged: `runtime`/`dynamic` remain static literals; export gating stays inside GET/POST handlers; `NEXT_OUTPUT_MODE` contract intact in `next.config.ts`.

### File List

- _bmad-output/implementation-artifacts/1-5-protect-build-mode-and-regression-safety-for-audio-extraction.md
- eslint.config.mjs
- src/components/CropPreviewPanel.tsx
- src/components/SaveDestinationDialog.tsx
- src/__tests__/hooks/ffmpegCommandPlanner.test.ts
- src/__tests__/components/ConverterCard.test.tsx
- src/__tests__/hooks/useFileConverter.test.ts
