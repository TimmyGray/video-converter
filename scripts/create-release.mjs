import { chmod, cp, mkdir, rm, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';

const rootDir = process.cwd();
const standaloneDir = path.join(rootDir, '.next', 'standalone');
const staticDir = path.join(rootDir, '.next', 'static');
const publicDir = path.join(rootDir, 'public');
const releaseDir = path.join(rootDir, 'release', 'video-forge');

if (!existsSync(standaloneDir)) {
  console.error('Missing .next/standalone output. Run `npm run build` first.');
  process.exit(1);
}

await rm(releaseDir, { recursive: true, force: true });
await mkdir(path.dirname(releaseDir), { recursive: true });

await cp(standaloneDir, releaseDir, { recursive: true });
await cp(staticDir, path.join(releaseDir, '.next', 'static'), { recursive: true });

if (existsSync(publicDir)) {
  await cp(publicDir, path.join(releaseDir, 'public'), { recursive: true });
}

await cp(
  path.join(rootDir, 'scripts', 'open-browser.mjs'),
  path.join(releaseDir, 'open-browser.mjs')
);

const startSh = `#!/usr/bin/env bash
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR"
if ! command -v node >/dev/null 2>&1; then
  echo "Node.js is required to run this app. Install Node.js 20+ and try again."
  exit 1
fi
node open-browser.mjs server.js
`;

const startCmd = `@echo off
setlocal
cd /d %~dp0
where node >nul 2>&1
if errorlevel 1 (
  echo Node.js is required to run this app. Install Node.js 20+ and try again.
  exit /b 1
)
node open-browser.mjs server.js
`;

const releaseReadme = `# VideoForge release bundle (video-forge)

## Quick start

- **Windows:** double-click \`start.cmd\`
- **macOS / Linux:** run \`./start.sh\` (first run: \`chmod +x start.sh\`)

The app starts a local server and opens your browser automatically.
`;

await writeFile(path.join(releaseDir, 'start.sh'), startSh, 'utf8');
await chmod(path.join(releaseDir, 'start.sh'), 0o755);
await writeFile(path.join(releaseDir, 'start.cmd'), startCmd, 'utf8');
await writeFile(path.join(releaseDir, 'README.md'), releaseReadme, 'utf8');

console.log(`Release bundle ready: ${releaseDir}`);
