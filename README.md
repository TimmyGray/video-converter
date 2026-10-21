# VideoForge – PWA Video Converter

A browser-based video converter built with Next.js, Material UI, and FFmpeg WebAssembly. Convert videos entirely in your browser — no server uploads required.

## Features

- 🎬 Convert between MP4, AVI, MOV, MKV, WEBM, and GIF formats
- 🔒 100% client-side processing via FFmpeg WASM (local transcription runs in-browser via Whisper WASM)
- ☁️ Optional: a Hugging Face token transcribes with hosted `whisper-large-v3` for higher accuracy and is the primary AI cleanup provider. An OpenRouter token enables cleanup only, using `qwen/qwen3.8-27b:free`; it is the sole cleanup provider when no Hugging Face token is set and the fallback when both are set. Audio is sent only to Hugging Face for hosted transcription; transcript text is sent to the selected cleanup provider. Without either token, processing stays fully on-device, and hosted transcription failures fall back locally.
- 📱 Progressive Web App (PWA) with offline support
- 🎨 Dark theme with amber/orange glow aesthetics (Material UI)
- 📦 Drag-and-drop file upload
- �� Real-time conversion progress

## Architecture

```text
src/
├── app/              # Next.js App Router pages and layouts
│   ├── layout.tsx    # Root layout with ThemeRegistry
│   ├── page.tsx      # Main page
│   ├── manifest.ts   # PWA manifest
│   └── globals.css   # Global styles
├── components/       # React UI components
│   ├── ThemeRegistry.tsx      # MUI theme provider
│   ├── Header.tsx             # App header
│   ├── ConverterCard.tsx      # Main conversion card (orchestrator)
│   ├── ConverterCardDynamic.tsx # Client-side dynamic import wrapper
│   ├── FileDropZone.tsx       # Drag-and-drop upload zone
│   ├── FormatSelector.tsx     # Output format chip grid
│   ├── ConversionProgress.tsx # Progress bar/spinner
│   └── FileInfoCard.tsx       # File metadata + status display
├── hooks/            # Custom React hooks
│   ├── useFFmpeg.ts           # FFmpeg WASM loading and transcoding
│   └── useFileConverter.ts    # Full conversion flow orchestration
├── utils/            # Pure utility functions
│   ├── formatUtils.ts         # Video format metadata and validation
│   └── sizeUtils.ts           # File size formatting
└── types/            # TypeScript type definitions
    └── index.ts
```

## Getting Started

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Folder watcher (unattended transcription)

A terminal service that transcribes new videos from a folder into `.txt` files, one at a time.

```bash
cp .env.example .env   # set WATCH_DIR and OUTPUT_DIR (absolute paths, both required)
npm run watch:transcribe
```

- Only videos larger than 5 MB and smaller than 1 GB are processed (`.mp4 .mkv .webm .mov .avi .m4v`, top level of the folder). A file is picked up once its size has stopped changing for 10 s.
- Each file is processed once; the record lives in `OUTPUT_DIR/.videoforge-watch-state.json`. Failed and cancelled files are not retried; delete their entry (or re-save the file) to run them again.
- Without `HF_TOKEN` everything runs on this machine (the first run downloads the Whisper model). With a token, audio slices are sent to Hugging Face and the transcript text is sent for cleanup; any failure falls back to the on-device model.
- Only one copy can run at a time. A second start prints the PID, start time and folders of the running one and exits with code 1. The lock is a loopback port (`INSTANCE_PORT`, default 47631) that the system releases when the process dies, so a crash never leaves it stuck. Set `INSTANCE_PORT` if another program uses that port.
- Hotkeys: `space` pause/resume the file being processed, `c` cancel it, `p` pause watching (the running file finishes), `s` start watching, `q` or Ctrl+C quit.
- Pausing a file freezes ffmpeg and the on-device engine at once (Linux and macOS; on Windows only the network steps pause) and holds the next hosted or cleanup request; a request already in flight finishes first. Time spent paused is not counted in the elapsed clock.
- `HF_POLISH_MODELS` and `OPENROUTER_POLISH_MODELS` in `.env` replace the models used for the AI cleanup (comma separated, tried in order, `org/model[:provider]`). Leave them empty for the built-in lists; the dashboard's Engine line shows what is in use.

## Testing

```bash
npm test
```

## Building

```bash
npm run build
npm start
```

## Docker

This repository includes a production multi-stage Dockerfile based on Next.js standalone output.

Build the image:

```bash
docker build -t videoforge .
```

Run the container:

```bash
docker run --rm -p 3000:3000 videoforge
```

Then open [http://localhost:3000](http://localhost:3000).

Optional runtime environment variables:

- `PORT` (default `3000`)
- `HOSTNAME` (default `0.0.0.0`)

Example:

```bash
docker run --rm -p 8080:8080 -e PORT=8080 videoforge
```

Notes:

- FFmpeg core assets are prepared during `npm run build`, so the container image includes local FFmpeg WASM assets.
- GUI-based desktop native save dialogs are not available in typical container/server deployments. In Docker deployments, use browser download behavior or a browser that supports the File System Access API.

## Release Bundle (one-click browser start)

Create a distributable folder that can be shared as a release artifact:

```bash
npm run release:build
```

This generates:

- `release/video-forge/start.cmd` (Windows)
- `release/video-forge/start.sh` (macOS/Linux)

End users can run one of these files to start the app and open it in a browser automatically.
On macOS/Linux, make `start.sh` executable once before first launch (`chmod +x start.sh`).

## Desktop Installers (Tauri)

Build desktop installers from this repo (no Node.js install required on end-user machines):

```bash
npm run tauri:build
```

Generated installers are placed under `src-tauri/target/release/bundle/`:

- Windows: `.msi` / setup `.exe`
- macOS: `.dmg`
- Linux: `.AppImage` / `.deb`

## GitHub Release Automation

A GitHub Actions workflow publishes:

- Browser bundle archives (`.zip` and `.tar.gz`) from `release/video-forge`
- Desktop installer artifacts built with Tauri for Windows, macOS, and Linux

### Automatic release on tag push

```bash
git tag v1.0.0
git push origin v1.0.0
```

### Manual release from Actions tab

Run the **Release** workflow and provide `tag_name` (for example `v1.0.0`).

## Run production build and open browser automatically

```bash
npm run build
npm run start:browser
```

## Technology Stack

- **Next.js 16** – App Router, TypeScript, Turbopack
- **Material UI v6** – Component library with custom dark theme
- **@ffmpeg/ffmpeg** – FFmpeg compiled to WebAssembly
- **Jest + React Testing Library** – Unit and component tests

## PWA

The app includes a web manifest and Cross-Origin isolation headers required for SharedArrayBuffer (FFmpeg WASM threading).
