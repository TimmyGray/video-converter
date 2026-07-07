---
stepsCompleted:
  - step-01-validate-prerequisites
  - step-02-design-epics
inputDocuments:
  - /home/timmy/Desktop/apps/video-converter/_bmad-output/planning-artifacts/prds/prd-video-converter-2026-07-07/prd.md
  - /home/timmy/Desktop/apps/video-converter/_bmad-output/planning-artifacts/architecture/architecture-video-converter-2026-07-07/ARCHITECTURE-SPINE.md
  - /home/timmy/Desktop/apps/video-converter/_bmad-output/planning-artifacts/architecture/architecture-video-converter-2026-07-07/ARCHITECTURE.md
---

# video-converter - Epic Breakdown

## Overview

This document provides the complete epic and story breakdown for video-converter, decomposing the requirements from the PRD, UX Design if it exists, and Architecture requirements into implementable stories.

## Requirements Inventory

### Functional Requirements

FR1: User can select an explicit Audio Extraction Mode before conversion; when active, output is constrained to MP3.
FR2: User can upload a supported source video for audio extraction and receive clear error feedback on invalid inputs.
FR3: System can convert one source video into one MP3 output with visible progress and completion/failure states.
FR4: User can save generated MP3 output locally after successful conversion.
FR5: System generates output filename using pattern <source-name>_audio.mp3 across save paths.
FR6: System encodes MP3 output with a fixed default profile (CBR 320 kbps) and no user-facing quality controls in v1.

### NonFunctional Requirements

NFR1: Conversion flow should remain a single uninterrupted user journey from upload to local save.
NFR2: MP3 output should maintain usable speech intelligibility while reducing file size versus source video.
NFR3: Runtime compatibility must be preserved across standalone web server mode and Tauri desktop mode.
NFR4: Save capability detection must not disable saving when at least one supported path is available.
NFR5: Build reliability requires prebuilt FFmpeg core assets to be present in production artifacts.

### Additional Requirements

- Maintain dual build-mode contract: standalone default build and export mode for desktop web packaging.
- Keep Next route segment config exports static literals; handle export/standalone behavior inside handler logic.
- Preserve deterministic FFmpeg load fallback order: local MT -> local ST -> CDN MT -> CDN ST.
- Preserve centralized conversion state ownership in `useFileConverter` to avoid UI state drift.
- Preserve save path gating across all runtime adapters: Browser File System Access API, Tauri command, and `/api/native-save`.
- Keep native save route Node-runtime only and export-safe (`runtime = nodejs`, static `dynamic` literal).
- Keep shared type/format contracts centralized in `src/types/index.ts` and `src/utils/formatUtils.ts`.
- Keep Tauri build coupling to exported frontend (`build:desktop:web`, `frontendDist: ../out`).
- Keep release and build scripts aligned with FFmpeg asset preparation and multi-runtime outputs.

### UX Design Requirements

No UX design contract was provided for this run.

### FR Coverage Map

FR1: Epic 1 - Explicit Audio Extraction mode selection.
FR2: Epic 1 - Source video upload and validation for audio extraction flow.
FR3: Epic 1 - Video-to-MP3 conversion with progress and actionable errors.
FR4: Epic 1 - Local save of generated MP3 output across supported runtime paths.
FR5: Epic 1 - Output naming with `_audio.mp3` suffix.
FR6: Epic 1 - Fixed CBR 320 kbps default MP3 profile without user quality controls.

## Epic List

### Epic 1: Audio Extraction to MP3 End-to-End
Enable users to switch to Audio Extraction Mode, convert video into high-quality MP3, and save locally with consistent naming and runtime-safe behavior.
**FRs covered:** FR1, FR2, FR3, FR4, FR5, FR6

## Epic 1: Audio Extraction to MP3 End-to-End

Enable users to switch to Audio Extraction Mode, convert video into high-quality MP3, and save locally with consistent naming and runtime-safe behavior.

### Story 1.1: Add audio extraction mode in the converter UI

As a screencast creator,
I want to switch the converter to Audio Extraction Mode,
So that I can run an audio-only workflow without video-specific controls.

**Acceptance Criteria:**

**Given** the user is on the converter screen
**When** the user enables Audio Extraction Mode
**Then** the mode state is clearly visible in the UI
**And** output format is constrained to MP3 in this mode.

**Given** Audio Extraction Mode is active
**When** the user reviews conversion controls
**Then** video crop controls are hidden or disabled
**And** conversion remains blocked until a valid source video is selected.

### Story 1.2: Convert source video to MP3 with fixed high-quality profile

As a screencast creator,
I want conversion to always produce one MP3 file using a fixed profile,
So that I get consistent output quality without configuring codec settings.

**Acceptance Criteria:**

**Given** Audio Extraction Mode is active and a valid source video is selected
**When** the user starts conversion
**Then** the system runs one conversion job that outputs exactly one MP3 file
**And** the encoder target profile is fixed to CBR 320 kbps.

**Given** conversion is in progress
**When** FFmpeg emits progress and completion events
**Then** the UI reflects loading/converting/done states with progress updates
**And** conversion failures surface actionable error messages.

### Story 1.3: Apply MP3 output naming convention

As a screencast creator,
I want generated audio files to use an `_audio.mp3` naming suffix,
So that I can quickly distinguish extracted audio from source videos.

**Acceptance Criteria:**

**Given** a source file named `demo.mov`
**When** MP3 conversion completes
**Then** the output file name is `demo_audio.mp3`
**And** no duplicate extension is added.

**Given** the output is ready to save
**When** save UI/actions are displayed
**Then** the same `_audio.mp3` file name appears consistently across save paths.

### Story 1.4: Preserve multi-runtime save behavior for MP3 output

As a screencast creator,
I want MP3 saving to work in browser, standalone server, and Tauri desktop runtimes,
So that I can reliably keep the converted file regardless of where I run the app.

**Acceptance Criteria:**

**Given** MP3 output exists and browser File System Access API is available
**When** user selects destination save
**Then** file is written via browser save picker
**And** success or cancellation state is handled without crashes.

**Given** app runs in Tauri runtime
**When** user selects destination save
**Then** save uses the native Tauri command dialog path
**And** saved output matches generated MP3 content.

**Given** browser picker is unavailable and `/api/native-save` capability is available
**When** user selects destination save
**Then** save is routed through Node native-save endpoint
**And** primary save action remains enabled because at least one save path exists.

### Story 1.5: Protect build-mode and regression safety for audio extraction

As a maintainer,
I want audio extraction changes to remain compatible with both standalone and export build modes,
So that release and desktop packaging flows continue to work after this feature lands.

**Acceptance Criteria:**

**Given** the audio extraction feature implementation is complete
**When** project validation is run
**Then** `npm run lint`, `npm test`, `npm run build`, and `npm run build:desktop:web` pass
**And** existing non-audio conversion formats remain functional.

**Given** `src/app/api/native-save/route.ts` participates in runtime save flow
**When** feature changes are reviewed
**Then** route segment config exports remain static literals
**And** export-mode capability gating remains inside handler logic.
