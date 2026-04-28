# VideoForge – PWA Video Converter

A browser-based video converter built with Next.js, Material UI, and FFmpeg WebAssembly. Convert videos entirely in your browser — no server uploads required.

## Features

- 🎬 Convert between MP4, AVI, MOV, MKV, WEBM, and GIF formats
- 🔒 100% client-side processing via FFmpeg WASM
- 📱 Progressive Web App (PWA) with offline support
- 🎨 Dark theme with amber/orange glow aesthetics (Material UI)
- 📦 Drag-and-drop file upload
- �� Real-time conversion progress

## Architecture

```
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

## Testing

```bash
npm test
```

## Building

```bash
npm run build
npm start
```

## Technology Stack

- **Next.js 16** – App Router, TypeScript, Turbopack
- **Material UI v6** – Component library with custom dark theme
- **@ffmpeg/ffmpeg** – FFmpeg compiled to WebAssembly
- **Jest + React Testing Library** – Unit and component tests

## PWA

The app includes a web manifest and Cross-Origin isolation headers required for SharedArrayBuffer (FFmpeg WASM threading).
