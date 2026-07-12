# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

@AGENTS.md

## Project overview

VideoForge is a **100% client-side** video toolkit (Next.js 16 App Router, React 19, MUI 9). All media processing runs in the browser via WebAssembly — nothing is uploaded to a server. It ships as three runtimes from one codebase: a Next.js standalone server, a static-export desktop web bundle, and a Tauri desktop app.

## Commands

```bash
npm run dev                 # Dev server (runs prepare:assets first via predev)
npm test                    # Jest (jsdom)
npm test -- formatUtils     # Single test file by name fragment
npm test -- -t "crop"       # Single test by name pattern
npm run lint                # ESLint (eslint-config-next)
npm run build               # Standalone build (default output mode)
npm run build:desktop:web   # Static export build (NEXT_OUTPUT_MODE=export -> ./out)
npm run tauri:dev           # Tauri desktop dev
npm run tauri:build         # Tauri desktop bundle
npm run release:build       # Standalone build + create-release bundle
```

`predev`/`build` run `prepare:assets`, which copies FFmpeg core (`prepare:ffmpeg-assets`) and ONNX Runtime WASM (`prepare:onnx-assets`) from `node_modules` into `public/`. **If FFmpeg or transcription fails to load after a dependency change, re-run `npm run prepare:assets` and rebuild** — the assets must be served same-origin (see below).

Before merging build/runtime changes, the project convention (`.github/instructions/build-modes-and-runtime-guards.instructions.md`) is to run: `npm run lint`, `npm test`, `npm run build`, `npm run build:desktop:web`, and `npm run tauri:build` when desktop packaging is touched.

## Architecture

### Conversion flow (the core)

`ConverterCard` (UI orchestrator) → `useFileConverter` (state machine) → `useFFmpeg` / `useTranscriber` (engines).

- **[useFileConverter.ts](src/hooks/useFileConverter.ts)** owns the single `ConversionJob` state object and drives one of three `ConversionMode`s: `video`, `audio-extraction` (→ mp3), `transcription` (→ txt/srt/vtt). It remembers the last-used format per mode (`lastVideoFormatRef` / `lastTranscriptFormatRef`) so switching modes restores a sensible format, and revokes stale blob object URLs on mode/format switch and reset. Output format determines everything downstream.
- **[useFFmpeg.ts](src/hooks/useFFmpeg.ts)** loads FFmpeg WASM with a **4-tier fallback ladder**: local multithreaded → local single-threaded → CDN multithreaded → CDN single-threaded. Multithreaded requires COOP/COEP headers (set in `next.config.ts` for standalone; provided by the desktop shell otherwise). `transcode` and `extractPcmWav` write the input to FFmpeg's virtual FS, run command attempts, then read/blob/clean up.
- **[ffmpegCommandPlanner.ts](src/hooks/ffmpegCommandPlanner.ts)** is a pure module returning arrays of FFmpeg arg-vectors. `getCommandAttempts` returns **ordered fallbacks tried until exit code 0** (e.g. webm: stream-copy if applicable → tuned libvpx → plain libvpx → bare remux). `getWavNormalizeCommand` produces the deterministic 16 kHz mono PCM WAV that Whisper consumes. Keep this module free of React/side effects — it's unit-tested in isolation.
- **Transcription pipeline**: FFmpeg normalizes to 16 kHz WAV (0–15% of progress bar) → `decodeWavToPcm16k` ([audioUtils.ts](src/utils/audioUtils.ts)) → Whisper runs in a **Web Worker** ([whisper.worker.ts](src/workers/whisper.worker.ts), model download 15–80%, inference 80–100%) → transcript serialized to txt/srt/vtt ([subtitleUtils.ts](src/utils/subtitleUtils.ts)). `useTranscriber` bridges the worker with request-id correlation and progress callbacks.

### Whisper worker specifics

Uses `@huggingface/transformers` with model `onnx-community/whisper-base`. Has its own **device fallback ladder**: WebGPU (q4) → WASM q8 with graph optimization *disabled* → WASM fp32. The disabled-optimization and same-origin ONNX path (`/ort/`, populated by `prepare-onnx-assets.mjs`) both work around bugs/CORS in the pinned dev-prerelease onnxruntime-web build — read the long comments in the worker before touching device/dtype config. Transcription runs in fixed 60-second windows for real progress reporting and to curb Whisper repetition.

### Multi-runtime save (`SaveDestinationDialog`)

The "choose destination" save path must preserve **all three** capability routes — regressions here are documented in [agent-learnings.md](agent-learnings.md). Never gate the primary save action on just one:
1. Browser **File System Access API** (`showSaveFilePicker`, Chromium secure contexts).
2. **Tauri** native dialog (`invoke('save_file_with_dialog')`, detected via `__TAURI__`/`__TAURI_INTERNALS__`).
3. Local **Node route** `/api/native-save` (zenity on Linux, osascript on macOS, PowerShell SaveFileDialog on Windows) for the standalone/browser-release variant.

Browser download is always the final fallback.

### Dual build modes

Output mode is switched by `NEXT_OUTPUT_MODE` in [next.config.ts](next.config.ts): `export` (static, for Tauri/`out/`) vs `standalone` (default). COOP/COEP headers are only emitted in standalone mode. **Route segment config (`dynamic`, `runtime`, etc.) must be static literals**, not runtime expressions — export mode requires static analyzability; put environment branching inside handler bodies (see `/api/native-save` and agent-learnings).

## Testing

Jest + ts-jest + jsdom, config in [jest.config.ts](jest.config.ts). `@/` maps to `src/`. Tests live in `src/__tests__/` mirroring the source tree. `@ffmpeg/*` is not transform-ignored so it can be imported in tests. Pointer/drag components that clamp min/max (crop selectors) need test inputs seeded *inside* the movable range — see agent-learnings for prior mistakes.

## Project conventions

- **`agent-learnings.md`** logs concrete past regressions (crop handle substring matching, clamped test values, route segment config, save-capability gating). Skim it before working on crop UI, save flow, or build modes.
- The `@AGENTS.md` note above is a hard rule: this Next.js version has breaking changes vs. training data — check `node_modules/next/dist/docs/` before writing Next-specific code.
- Blob object URLs are manually revoked throughout `useFileConverter`; preserve that lifecycle when adding output-producing paths to avoid leaks.
