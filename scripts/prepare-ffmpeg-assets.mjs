import { cp, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';

const rootDir = process.cwd();

// Single-threaded core
const stSourceDir = path.join(rootDir, 'node_modules', '@ffmpeg', 'core', 'dist', 'umd');
const stTargetDir = path.join(rootDir, 'public', 'ffmpeg-core');

if (!existsSync(stSourceDir)) {
  console.error('Missing @ffmpeg/core assets. Run `npm install` and try again.');
  process.exit(1);
}

await mkdir(stTargetDir, { recursive: true });
await cp(path.join(stSourceDir, 'ffmpeg-core.js'), path.join(stTargetDir, 'ffmpeg-core.js'));
await cp(path.join(stSourceDir, 'ffmpeg-core.wasm'), path.join(stTargetDir, 'ffmpeg-core.wasm'));
console.log(`FFmpeg single-threaded core prepared: ${stTargetDir}`);

// Multi-threaded core (preferred — uses all CPU cores via SharedArrayBuffer)
const mtSourceDir = path.join(rootDir, 'node_modules', '@ffmpeg', 'core-mt', 'dist', 'umd');
const mtTargetDir = path.join(rootDir, 'public', 'ffmpeg-core-mt');

if (!existsSync(mtSourceDir)) {
  console.warn('Warning: @ffmpeg/core-mt not found. Multi-threaded FFmpeg will not be available locally.');
} else {
  await mkdir(mtTargetDir, { recursive: true });
  await cp(path.join(mtSourceDir, 'ffmpeg-core.js'), path.join(mtTargetDir, 'ffmpeg-core.js'));
  await cp(path.join(mtSourceDir, 'ffmpeg-core.wasm'), path.join(mtTargetDir, 'ffmpeg-core.wasm'));
  await cp(path.join(mtSourceDir, 'ffmpeg-core.worker.js'), path.join(mtTargetDir, 'ffmpeg-core.worker.js'));
  console.log(`FFmpeg multi-threaded core prepared: ${mtTargetDir}`);
}
