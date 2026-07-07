---
baseline_commit: fb99688eea415ec9e2856382a19ce78c216b81cf
---

# Story 1.1: Add audio extraction mode in the converter UI

Status: review

## Story

As a screencast creator,
I want to switch the converter to Audio Extraction Mode,
so that I can run an audio-only workflow without video-specific controls.

## Acceptance Criteria

1. Given the user is on the converter screen, when the user enables Audio Extraction Mode, then the mode state is clearly visible in the UI and output format is constrained to MP3 in this mode.
2. Given Audio Extraction Mode is active, when the user reviews conversion controls, then video crop controls are hidden or disabled and conversion remains blocked until a valid source video is selected.

## Tasks / Subtasks

- [x] Introduce explicit conversion mode state and UI affordance (AC: 1)
  - [x] Add a mode contract in shared types (for example a new ConversionMode union) so mode is represented in the central job state.
  - [x] Extend useFileConverter state/actions to own mode switching and keep mode transitions in the orchestration hook.
  - [x] Add an explicit UI control in ConverterCard to toggle between normal video conversion and Audio Extraction Mode.
  - [x] Make mode visibility unambiguous (label/chip/segment control) and visible without opening sub-panels.
- [x] Constrain output options when audio mode is active (AC: 1)
  - [x] Update format selection behavior so MP3 is the only selectable output in audio mode.
  - [x] Preserve existing non-audio format behavior when mode is not audio extraction.
- [x] Hide or disable video-only controls in audio mode (AC: 2)
  - [x] Hide or disable CropSelector in audio mode.
  - [x] Hide or disable CropPreviewPanel in audio mode.
  - [x] Ensure hidden crop UI does not break existing crop state when switching back to video mode.
- [x] Preserve conversion gating semantics (AC: 2)
  - [x] Keep Convert action blocked until a valid source video is selected.
  - [x] Ensure this behavior is unchanged in both conversion modes.
- [x] Add/adjust tests for mode UI and gating (AC: 1, 2)
  - [x] Add component tests for mode visibility and crop control hiding/disabling.
  - [x] Extend hook tests for mode transitions and format constraint behavior.
  - [x] Keep existing crop and format tests passing.

## Dev Notes

### Technical Requirements

- Centralize mode state in useFileConverter (single source of truth for conversion lifecycle).
- Do not split mode ownership across components; UI should consume hook state.
- MP3-only constraint in audio mode must be deterministic and not dependent on side effects.
- Existing file validation logic (isValidVideoFile) remains the gate for valid source video selection.

### Architecture Compliance

- AD-2: Keep status/mode transition ownership in useFileConverter.
- AD-6: Keep format and type contracts centralized in src/types/index.ts and src/utils/formatUtils.ts.
- AD-4: Do not regress save-path gating behavior while changing mode UI.

### Library/Framework Requirements

- Next.js 16 App Router patterns only.
- React 19 + hook-driven state updates.
- Material UI component patterns already used in ConverterCard and selector components.

### File Structure Requirements

- Update: src/types/index.ts
- Update: src/hooks/useFileConverter.ts
- Update: src/components/ConverterCard.tsx
- Update: src/components/FormatSelector.tsx (or pass constrained format list from parent)
- Update: src/components/CropSelector.tsx and/or src/components/CropPreviewPanel.tsx wiring
- Add/Update tests under: src/__tests__/components/, src/__tests__/hooks/

### Testing Requirements

- Extend src/__tests__/hooks/useFileConverter.test.ts for mode state behavior.
- Add/extend component tests to verify:
  - mode control renders and toggles
  - MP3-only selection in audio mode
  - crop controls hidden/disabled in audio mode
  - convert button still blocked without valid file
- Keep existing tests for CropSelector and FormatSelector green.

### Previous Story Intelligence

- No prior implementation-artifact story files exist yet in _bmad-output/implementation-artifacts.
- Implement this as the epic foundation for stories 1.2-1.5.

### Git Intelligence Summary

- Recent commits heavily modified crop UX and preview behavior.
- Risk area: ConverterCard and CropPreviewPanel coupling.
- Preserve current crop interactions in video mode while introducing audio mode branches.

### Latest Technical Information

- Next route segment config rules remain static-literal only; do not introduce runtime expressions for route exports.
- React Testing Library + renderHook are current test patterns in this repo.

### Project Structure Notes

- Keep dynamic client boundary unchanged in src/components/ConverterCardDynamic.tsx.
- Keep mode logic in existing converter flow, not in app/page shell.

### References

- _bmad-output/planning-artifacts/epics.md (Epic 1, Story 1.1)
- _bmad-output/planning-artifacts/prds/prd-video-converter-2026-07-07/prd.md (Section 4.1 FR-1, FR-2)
- _bmad-output/planning-artifacts/architecture/architecture-video-converter-2026-07-07/ARCHITECTURE-SPINE.md (AD-2, AD-6)
- _bmad-output/planning-artifacts/architecture/architecture-video-converter-2026-07-07/ARCHITECTURE.md (Sections 4, 5, 6)
- src/components/ConverterCard.tsx
- src/hooks/useFileConverter.ts
- src/components/FormatSelector.tsx
- src/components/CropSelector.tsx
- src/components/CropPreviewPanel.tsx
- src/components/FileDropZone.tsx

## Dev Agent Record

### Agent Model Used

GPT-5.3-Codex

### Debug Log References

- `npm test -- --runTestsByPath src/__tests__/hooks/useFileConverter.test.ts src/__tests__/components/FormatSelector.test.tsx src/__tests__/components/ConverterCard.test.tsx`
- `npm test`
- `npm run lint` (pre-existing lint errors in unrelated files: src/components/CropPreviewPanel.tsx and src/components/SaveDestinationDialog.tsx)

### Completion Notes List

- Added explicit `ConversionMode` state contract and MP3 output format support in shared type/format utilities.
- Centralized mode transitions in `useFileConverter` with deterministic MP3 forcing in audio mode and restoration of last non-audio format when returning to video mode.
- Added converter mode UI (toggle group + visible mode chip), MP3-only format wiring in audio mode, and conditional hiding of crop controls/panel.
- Preserved conversion gate semantics by requiring a valid video source file before enabling conversion in both modes.
- Added/updated tests for hook mode transitions, MP3-only format rendering, audio-mode crop hiding, and convert-button gating.

### File List

- _bmad-output/implementation-artifacts/1-1-add-audio-extraction-mode-in-the-converter-ui.md
- src/types/index.ts
- src/utils/formatUtils.ts
- src/hooks/useFileConverter.ts
- src/components/FormatSelector.tsx
- src/components/ConverterCard.tsx
- src/__tests__/hooks/useFileConverter.test.ts
- src/__tests__/components/FormatSelector.test.tsx
- src/__tests__/components/ConverterCard.test.tsx

## Change Log

- 2026-07-07: Implemented Story 1.1 audio extraction mode UI/state foundation, added MP3 mode constraints, hid crop controls in audio mode, and expanded hook/component tests.
