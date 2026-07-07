# Story 1.3: Apply MP3 output naming convention

Status: ready-for-dev

## Story

As a screencast creator,
I want generated audio files to use an _audio.mp3 naming suffix,
so that I can quickly distinguish extracted audio from source videos.

## Acceptance Criteria

1. Given a source file named demo.mov, when MP3 conversion completes, then the output file name is demo_audio.mp3 and no duplicate extension is added.
2. Given the output is ready to save, when save UI/actions are displayed, then the same _audio.mp3 file name appears consistently across save paths.

## Tasks / Subtasks

- [ ] Implement deterministic audio naming contract (AC: 1)
  - [ ] Add naming logic that appends _audio before .mp3 for audio extraction outputs.
  - [ ] Ensure extension handling is idempotent (no double .mp3).
  - [ ] Keep existing naming behavior unchanged for non-audio formats.
- [ ] Wire naming source-of-truth through conversion flow (AC: 1)
  - [ ] Ensure useFFmpeg output file naming uses shared naming utility.
  - [ ] If needed, pass conversion mode context to naming function without duplicating naming logic in components.
- [ ] Preserve naming consistency through save UX (AC: 2)
  - [ ] Ensure SaveDestinationDialog default file name is the generated _audio.mp3 value.
  - [ ] Ensure Browser Download, File System Access, Tauri, and server-native flows use the same resolved file name.
- [ ] Add test coverage for naming and propagation (AC: 1, 2)
  - [ ] Extend formatUtils tests for _audio.mp3 suffix rules and duplicate-extension guard.
  - [ ] Extend hook tests so conversion outputFileName for audio mode follows naming contract.
  - [ ] Add/extend save dialog tests to verify displayed and used file name matches generated name.

## Dev Notes

### Technical Requirements

- Keep naming logic centralized in src/utils/formatUtils.ts (or a focused naming helper in utils) and avoid ad-hoc string handling in UI components.
- The naming contract is mode-specific: audio extraction output is <source-name>_audio.mp3.
- Ensure conversion output metadata and save dialog target name remain synchronized.

### Architecture Compliance

- AD-6: Naming/format rules remain centralized.
- AD-2: useFileConverter remains owner of output metadata in job state.
- AD-4: Save-path behavior must remain fully runtime-aware while applying naming.

### Library/Framework Requirements

- Continue using existing TypeScript utility-first pattern in src/utils.
- Preserve hook/component boundaries; avoid business-logic duplication in React components.

### File Structure Requirements

- Update: src/utils/formatUtils.ts
- Update: src/hooks/useFFmpeg.ts and/or src/hooks/useFileConverter.ts (for mode-aware naming propagation)
- Update: src/components/SaveDestinationDialog.tsx (only if default-name behavior needs adjustment)
- Add/Update tests:
  - src/__tests__/utils/formatUtils.test.ts
  - src/__tests__/hooks/useFileConverter.test.ts
  - optional new test file: src/__tests__/components/SaveDestinationDialog.test.tsx

### Testing Requirements

- Validate input examples:
  - demo.mov -> demo_audio.mp3
  - demo -> demo_audio.mp3
  - demo.audio.mov -> demo.audio_audio.mp3
- Validate no duplicate extension behavior for pre-normalized names.
- Validate same computed name reaches all save paths and download fallback.

### Previous Story Intelligence

- Story 1.2 introduces MP3 conversion output; this story hardens naming and propagation.
- No prior implementation-artifact completion notes are available yet; treat this as first-pass naming contract definition.

### Git Intelligence Summary

- Existing codebase uses centralized helper functions in utils for format behavior.
- Follow this pattern to minimize regression in ConverterCard and SaveDestinationDialog display behavior.

### Latest Technical Information

- Browser/File System save APIs may normalize extension suggestions differently by UA; application-level naming must be explicit and deterministic before API invocation.

### Project Structure Notes

- Prefer one canonical naming helper consumed by both engine and save layers.
- Do not hardcode _audio suffix in multiple components.

### References

- _bmad-output/planning-artifacts/epics.md (Epic 1, Story 1.3)
- _bmad-output/planning-artifacts/prds/prd-video-converter-2026-07-07/prd.md (Section 4.2 FR-5)
- _bmad-output/planning-artifacts/architecture/architecture-video-converter-2026-07-07/ARCHITECTURE-SPINE.md (AD-2, AD-4, AD-6)
- _bmad-output/planning-artifacts/architecture/architecture-video-converter-2026-07-07/ARCHITECTURE.md (Sections 5.3, 6.3)
- src/utils/formatUtils.ts
- src/hooks/useFFmpeg.ts
- src/hooks/useFileConverter.ts
- src/components/SaveDestinationDialog.tsx

## Dev Agent Record

### Agent Model Used

GPT-5.3-Codex

### Debug Log References

- N/A

### Completion Notes List

- Ultimate context engine analysis completed - comprehensive developer guide created.

### File List

- _bmad-output/implementation-artifacts/1-3-apply-mp3-output-naming-convention.md
