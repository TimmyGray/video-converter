import { cp, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';

const rootDir = process.cwd();
const sourceDir = path.join(rootDir, 'node_modules', '@ffmpeg', 'core', 'dist', 'umd');
const targetDir = path.join(rootDir, 'public', 'ffmpeg-core');

if (!existsSync(sourceDir)) {
  console.error('Missing @ffmpeg/core assets. Run `npm install` and try again.');
  process.exit(1);
}

await mkdir(targetDir, { recursive: true });
await cp(path.join(sourceDir, 'ffmpeg-core.js'), path.join(targetDir, 'ffmpeg-core.js'));
await cp(path.join(sourceDir, 'ffmpeg-core.wasm'), path.join(targetDir, 'ffmpeg-core.wasm'));

console.log(`FFmpeg core assets prepared: ${targetDir}`);
