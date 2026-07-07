# Story 1.5: Protect build-mode and regression safety for audio extraction

Status: ready-for-dev

## Story

As a maintainer,
I want audio extraction changes to remain compatible with both standalone and export build modes,
so that release and desktop packaging flows continue to work after this feature lands.

## Acceptance Criteria

1. Given the audio extraction feature implementation is complete, when project validation is run, then npm run lint, npm test, npm run build, and npm run build:desktop:web pass and existing non-audio conversion formats remain functional.
2. Given src/app/api/native-save/route.ts participates in runtime save flow, when feature changes are reviewed, then route segment config exports remain static literals and export-mode capability gating remains inside handler logic.

## Tasks / Subtasks

- [ ] Execute and document full validation matrix (AC: 1)
  - [ ] Run npm run lint.
  - [ ] Run npm test.
  - [ ] Run npm run build.
  - [ ] Run npm run build:desktop:web.
  - [ ] If desktop packaging behavior changed, run npm run tauri:build.
  - [ ] Capture command outcomes in completion notes.
- [ ] Add focused regression coverage for audio mode vs existing formats (AC: 1)
  - [ ] Add tests ensuring non-audio formats still appear and convert in normal video mode.
  - [ ] Add tests ensuring audio-mode constraints do not leak into normal video-mode behavior.
- [ ] Enforce route config and export-guard constraints (AC: 2)
  - [ ] Keep runtime and dynamic exports static literals in src/app/api/native-save/route.ts.
  - [ ] Keep export/standalone branching inside GET/POST handlers.
  - [ ] Ensure no conditional expression is introduced in route segment config exports.
- [ ] Validate build mode contract remains environment-driven (AC: 1, 2)
  - [ ] Keep NEXT_OUTPUT_MODE contract in next.config.ts.
  - [ ] Ensure release and desktop scripts remain aligned with FFmpeg asset preparation and output targets.
- [ ] Validate FFmpeg asset preparation assumptions (AC: 1)
  - [ ] If builds fail on FFmpeg core availability, run prepare:ffmpeg-assets and confirm assets exist in public/ffmpeg-core and public/ffmpeg-core-mt.

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

GPT-5.3-Codex

### Debug Log References

- N/A

### Completion Notes List

- Ultimate context engine analysis completed - comprehensive developer guide created.

### File List

- _bmad-output/implementation-artifacts/1-5-protect-build-mode-and-regression-safety-for-audio-extraction.md
