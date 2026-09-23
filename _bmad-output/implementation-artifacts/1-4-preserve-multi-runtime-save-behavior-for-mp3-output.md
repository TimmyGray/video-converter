# Story 1.4: Preserve multi-runtime save behavior for MP3 output

Status: ready-for-review

## Story

As a screencast creator,
I want MP3 saving to work in browser, standalone server, and Tauri desktop runtimes,
so that I can reliably keep the converted file regardless of where I run the app.

## Acceptance Criteria

1. Given MP3 output exists and browser File System Access API is available, when user selects destination save, then file is written via browser save picker and success or cancellation state is handled without crashes.
2. Given app runs in Tauri runtime, when user selects destination save, then save uses the native Tauri command dialog path and saved output matches generated MP3 content.
3. Given browser picker is unavailable and /api/native-save capability is available, when user selects destination save, then save is routed through Node native-save endpoint and primary save action remains enabled because at least one save path exists.

## Tasks / Subtasks

- [x] Preserve capability matrix and CTA enablement logic (AC: 1, 2, 3)
  - [x] Confirm pickerAvailable logic remains true when any path exists (browser picker OR tauri OR native server route).
  - [x] Ensure Choose Destination is disabled only when all supported paths are unavailable.
- [x] Validate browser picker save flow for MP3 output (AC: 1)
  - [x] Ensure showSaveFilePicker path writes audio blob successfully with stable error and cancel handling.
  - [x] Ensure File System Access permission flow remains robust.
- [x] Validate Tauri native save flow for MP3 output (AC: 2)
  - [x] Keep save_file_with_dialog invocation and base64 payload conversion unchanged except for MP3 naming/mime updates.
  - [x] Confirm cancellation does not throw user-visible crash.
- [x] Validate Node route fallback save path for MP3 output (AC: 3)
  - [x] Keep GET capability check and POST save behavior in /api/native-save route.
  - [x] Ensure output export gating remains handler-level and route config exports remain static literals.
  - [x] Ensure server path remains available in standalone mode and unavailable in export mode by capability response.
- [x] Add missing SaveDestinationDialog test coverage (AC: 1, 2, 3)
  - [x] Add new component test file for runtime-path gating and choose destination enablement.
  - [x] Add tests for each path selection branch (browser picker, tauri, native server fallback).
  - [x] Add tests for cancellation and error handling without crash regressions.

## Dev Notes

### Technical Requirements

- Multi-runtime save behavior is an architectural invariant, not optional UX.
- Never gate save action on one runtime path only.
- Keep save behavior deterministic and branch selection explicit.
- Keep MP3 filename and output blob consistent across all runtime adapters.

### Architecture Compliance

- AD-4: Must include Browser API + Tauri + Node route in capability gating.
- AD-5: Keep runtime=nodejs and static dynamic literal in src/app/api/native-save/route.ts.
- AD-8: Do not break Tauri desktop coupling to exported frontend artifacts.

### Library/Framework Requirements

- @tauri-apps/api core invoke path remains the desktop bridge.
- Browser save APIs continue to use File System Access API when supported.
- Next App Router route handler behavior must remain static-export compatible.

### File Structure Requirements

- Update: src/components/SaveDestinationDialog.tsx
- Update (if required): src/app/api/native-save/route.ts
- Verify: src-tauri/src/main.rs
- Add tests: src/__tests__/components/SaveDestinationDialog.test.tsx
- Optional route tests: src/__tests__/app/api/native-save/route.test.ts (if adding handler-level test coverage)

### Testing Requirements

- Path-availability matrix tests:
  - Browser picker available -> choose destination enabled
  - Tauri runtime -> choose destination enabled without browser picker
  - Browser picker unavailable + native route available -> choose destination enabled
  - All unavailable -> choose destination disabled and warning shown
- Save outcome tests:
  - saved path closes dialog
  - cancelled path does not crash
  - errors surface actionable message

### Previous Story Intelligence

- Story 1.3 establishes deterministic output filename; this story ensures that filename survives all runtime save paths.
- Existing repository learning explicitly flags save-button gating bugs when fallback paths are ignored.

### Git Intelligence Summary

- Recent save/runtime related fixes touched native-save route and runtime guards.
- Risk area is accidental CTA disablement in non-standard webview/browser contexts.

### Latest Technical Information

- Next output export mode cannot host active API routes; capability probing must account for this and remain inside handler logic.
- Tauri invoke flow remains the preferred desktop-native save mechanism in bundled desktop apps.

### Project Structure Notes

- Keep save adapter logic in SaveDestinationDialog rather than scattering runtime checks into ConverterCard.
- Route logic must remain isolated in src/app/api/native-save/route.ts for standalone local-server mode.

### References

- _bmad-output/planning-artifacts/epics.md (Epic 1, Story 1.4)
- _bmad-output/planning-artifacts/prds/prd-video-converter-2026-07-07/prd.md (Section 4.2 FR-4)
- _bmad-output/planning-artifacts/architecture/architecture-video-converter-2026-07-07/ARCHITECTURE-SPINE.md (AD-4, AD-5, AD-8)
- _bmad-output/planning-artifacts/architecture/architecture-video-converter-2026-07-07/ARCHITECTURE.md (Sections 3, 6.3, 7)
- .github/instructions/build-modes-and-runtime-guards.instructions.md
- agent-learnings.md (Save button gated without desktop fallback; route config static literal)
- src/components/SaveDestinationDialog.tsx
- src/app/api/native-save/route.ts
- src-tauri/src/main.rs

## Dev Agent Record

### Agent Model Used

GPT-5.3-Codex

### Debug Log References

- npm test -- SaveDestinationDialog.test.tsx

### Completion Notes List

- Added DS 1.4 SaveDestinationDialog test coverage for runtime-path capability matrix (browser picker, Tauri runtime, native server fallback, all-unavailable case).
- Added save-branch behavior tests for browser picker, Tauri invoke bridge, and native server POST flow.
- Added cancellation and permission/error handling tests to prevent crash regressions.
- Verified route/runtime invariants remain compliant (static route config literal, export-mode gating in handler logic).

### File List

- _bmad-output/implementation-artifacts/1-4-preserve-multi-runtime-save-behavior-for-mp3-output.md
- src/__tests__/components/SaveDestinationDialog.test.tsx
