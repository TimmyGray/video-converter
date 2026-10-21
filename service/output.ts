import fs from 'node:fs/promises';
import path from 'node:path';
import { PARTIAL_SUFFIX } from './config';

export async function pickOutputPath(outputDir: string, videoPath: string): Promise<string> {
  const base = path.basename(videoPath, path.extname(videoPath));
  for (let attempt = 1; ; attempt++) {
    const name = attempt === 1 ? `${base}.txt` : `${base} (${attempt}).txt`;
    const candidate = path.join(outputDir, name);
    try {
      await fs.access(candidate);
    } catch {
      return candidate;
    }
  }
}

export async function writeTextAtomically(target: string, text: string): Promise<void> {
  const partial = `${target}${PARTIAL_SUFFIX}`;
  await fs.writeFile(partial, text);
  await fs.rename(partial, target);
}

export async function removeStalePartials(outputDir: string): Promise<void> {
  for (const name of await fs.readdir(outputDir)) {
    if (name.endsWith(`.txt${PARTIAL_SUFFIX}`)) await fs.rm(path.join(outputDir, name), { force: true });
  }
}
