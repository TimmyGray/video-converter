---
title: "VideoForge Complete Architecture Documentation"
status: final
created: 2026-07-07
updated: 2026-07-07
sourceSpine: ./ARCHITECTURE-SPINE.md
---

# VideoForge Complete Architecture Documentation

## 1. Purpose and Scope

This document provides end-to-end architecture documentation for the VideoForge project.
It covers:

- system context and runtime modes,
- module and dependency boundaries,
- conversion and save execution flows,
- build/release/deployment architecture,
- quality constraints and extension guidance.

The authoritative invariant contract lives in `ARCHITECTURE-SPINE.md`; this document expands it for implementation and onboarding.

## 2. System Context

VideoForge is a client-first video converter that uses FFmpeg WebAssembly in the browser layer and supports multiple runtime environments:

1. Standalone Next.js server runtime (default production/release web build).
2. Static export runtime consumed by Tauri desktop shell.
3. Desktop native save pathways via:
   - Tauri Rust command bridge, or
   - Next Node API route in standalone mode.

The product intentionally avoids remote media processing and keeps conversion on-device.

## 3. Runtime and Deployment Modes

### 3.1 Runtime matrix

| Mode | Build trigger | Runtime substrate | Save paths | Notes |
| --- | --- | --- | --- | --- |
| Web standalone | `npm run build` | Next.js standalone server (`.next/standalone`) | Browser File System Access API + `/api/native-save` | Default production/release path |
| Desktop web export | `npm run build:desktop:web` | Static export (`out/`) | Browser download/File System Access API where supported | Used by Tauri frontendDist |
| Tauri desktop | `npm run tauri:build` | Native shell + exported web UI | Tauri command `save_file_with_dialog` | Native OS dialog UX |

### 3.2 Runtime guardrails

- Output mode must remain environment-driven (`NEXT_OUTPUT_MODE` controls standalone vs export).
- Route segment config in API routes remains static literals.
- Save action capability checks must include all three supported paths.
- FFmpeg assets must be prepared before build to avoid missing core binaries at runtime.

## 4. Code Architecture

### 4.1 Top-level layering

1. UI Layer
   - App shell and primary UI composition.
   - Files: `src/app/layout.tsx`, `src/app/page.tsx`, `src/components/*`.

2. Orchestration Layer
   - Conversion state machine and user action handling.
   - File: `src/hooks/useFileConverter.ts`.

3. Engine Adapter Layer
   - FFmpeg loading strategy and transcode command execution.
   - File: `src/hooks/useFFmpeg.ts`.

4. Runtime Adapter Layer
   - Save destination handling across browser/Tauri/Node route.
   - Files: `src/components/SaveDestinationDialog.tsx`, `src/app/api/native-save/route.ts`, `src-tauri/src/main.rs`.

5. Shared Domain Contracts
   - Types and format metadata for cross-layer compatibility.
   - Files: `src/types/index.ts`, `src/utils/formatUtils.ts`.

### 4.2 Component responsibilities

- ConverterCard: orchestrates file selection, format selection, crop controls, conversion trigger, and save dialog launch.
- ConverterCardDynamic: enforces client-only rendering for FFmpeg-heavy UI.
- SaveDestinationDialog: runtime capability probing and destination save execution.
- useFileConverter: owns conversion lifecycle state and receives transcode result data.
- useFFmpeg: encapsulates all FFmpeg loading/exec details and engine fallbacks.

## 5. Data and State Model

### 5.1 Core state object

`ConversionJob` is the central state contract:

- Input: file, output format, crop settings.
- Runtime state: status, progress.
- Output artifacts: object URL, filename, output size, duration, ffmpeg mode.
- Error channel: user-visible message.

### 5.2 Status lifecycle

`idle -> loading -> converting -> done | error`

Only orchestration hook logic mutates this lifecycle, keeping UI deterministic.

### 5.3 Format model

Format metadata (label, extension, MIME, color, description) is centralized in one map to ensure:

- consistent UI chips,
- correct output naming,
- correct MIME typing during save/download.

## 6. Core Execution Flows

### 6.1 FFmpeg load flow

1. Attempt local multithreaded core.
2. Fallback to local single-threaded core.
3. Fallback to CDN multithreaded core.
4. Fallback to CDN single-threaded core.

This preserves best-effort performance while maintaining reliability.

### 6.2 Conversion flow

1. User uploads source file and selects output format.
2. Orchestrator sets loading state and ensures FFmpeg is available.
3. FFmpeg writes input file in virtual FS, executes command attempts, reads output, creates Blob URL.
4. Orchestrator commits done state and output metadata.
5. UI enables save action.

### 6.3 Save flow

Save path is selected by runtime capability:

1. Tauri runtime detected -> invoke Rust command bridge.
2. Browser picker available -> use File System Access API.
3. Browser picker unavailable but local server route available -> POST to `/api/native-save`.
4. Fallback -> browser default download behavior.

## 7. Native Save Subsystem

### 7.1 Next Node route (`/api/native-save`)

- `GET` reports capability for native dialog support.
- `POST` receives file payload and writes to user-selected native path.
- Platform-specific strategy:
  - Windows: PowerShell save dialog.
  - macOS: AppleScript save dialog.
  - Linux: zenity save dialog.

### 7.2 Tauri command bridge

- Command: `save_file_with_dialog(file_name, data_base64)`.
- Uses `rfd::FileDialog` for native save picker.
- Decodes Base64 payload and writes bytes to selected path.

## 8. Build and Release Architecture

### 8.1 Build chain

- `prepare-ffmpeg-assets` copies ffmpeg core binaries from node_modules into public assets.
- `build` executes asset preparation + Next build (standalone default).
- `build:desktop:web` runs export mode via environment variable.

### 8.2 Release outputs

- `release:build` packages standalone server output + static assets + startup scripts.
- Tauri build packages exported frontend into native installers.

### 8.3 Artifact layout highlights

- `.next/standalone` -> server release substrate.
- `out/` -> export build for Tauri.
- `public/ffmpeg-core*` -> runtime FFmpeg binaries.
- `release/video-forge/` -> distributable browser-launch bundle.

## 9. Security and Platform Considerations

- Standalone mode adds COOP/COEP headers needed for SharedArrayBuffer multithreaded FFmpeg.
- Export mode omits those headers due static hosting constraints.
- Native save behavior is runtime- and platform-dependent; capability probes precede user actions.
- Local save route is unavailable in static export mode by design.

## 10. Testing Architecture

- Unit/component tests run via Jest + React Testing Library in jsdom.
- Hook testing follows renderHook patterns with module-level mocks.
- Regression-sensitive areas:
  - clamped UI controls,
  - save capability gating across runtime variants,
  - route behavior under export/standalone mode differences.

## 11. Extension Playbook

When adding new conversion capabilities (for example audio-only extraction), follow this order:

1. Update shared domain contracts (`VideoFormat`, format metadata) if needed.
2. Extend FFmpeg command planning in engine adapter with deterministic fallback behavior.
3. Update orchestration state transitions only in `useFileConverter`.
4. Adjust UI selectors and save naming rules while preserving save capability matrix.
5. Validate both standalone and export/Tauri paths before merge.

## 12. Known Architecture Risks and Mitigations

| Risk | Impact | Mitigation |
| --- | --- | --- |
| Missing FFmpeg binaries in artifacts | Conversion unavailable at runtime | Keep prebuild asset preparation mandatory in build scripts |
| Incomplete save path gating | User cannot save despite valid runtime path | Keep capability checks for Browser API + Tauri + Node route |
| Export-mode route assumptions | Build/runtime failures | Keep static route config and move conditional behavior into handlers |
| Runtime behavior drift across modes | Feature regressions in one target | Validate both standalone and export/Tauri in release checks |

## 13. Recommended Next Artifacts

1. Epic/story breakdown linked to PRD and this architecture.
2. Targeted architecture update for audio extraction mode once implementation decisions are locked.
3. Optional observability addendum if conversion telemetry becomes a requirement.
