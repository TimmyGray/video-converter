import { cp, mkdir, readdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';

// Serve the ONNX Runtime Web WASM assets locally instead of letting transformers.js fetch
// them from its default CDN. That default points at a *dev-prerelease* onnxruntime-web build
// (e.g. 1.26.0-dev.*) which is not published on jsdelivr and is also blocked by our
// Cross-Origin-Embedder-Policy: require-corp header — either way the WASM backend fails to
// initialize ("no available backend found"). Copying the files that ship in node_modules into
// /public/ort keeps them same-origin and version-matched. Mirrors prepare-ffmpeg-assets.mjs.

const rootDir = process.cwd();
const sourceDir = path.join(rootDir, 'node_modules', 'onnxruntime-web', 'dist');
const targetDir = path.join(rootDir, 'public', 'ort');

if (!existsSync(sourceDir)) {
  console.error('Missing onnxruntime-web assets. Run `npm install` and try again.');
  process.exit(1);
}

// The transformers.js WASM backend loads `ort-wasm-simd-threaded*.{mjs,wasm}`. Copy the whole
// family so whichever variant ONNX Runtime selects (plain / asyncify / jsep) resolves locally.
const entries = await readdir(sourceDir);
const wanted = entries.filter(
  (name) => /^ort-wasm-simd-threaded.*\.(mjs|wasm)$/.test(name)
);

if (wanted.length === 0) {
  console.error('No ort-wasm-simd-threaded assets found in onnxruntime-web/dist.');
  process.exit(1);
}

await mkdir(targetDir, { recursive: true });
for (const name of wanted) {
  const dest = path.join(targetDir, name);
  // Skip files already copied so `predev` stays fast on repeat runs.
  if (existsSync(dest)) continue;
  await cp(path.join(sourceDir, name), dest);
}

console.log(`ONNX Runtime WASM assets prepared: ${targetDir} (${wanted.length} files)`);
