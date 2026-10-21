/** @jest-environment node */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { loadConfig } from '../../../service/config';

const tempDirs: string[] = [];
const makeDir = () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vf-config-'));
  tempDirs.push(dir);
  return dir;
};

afterAll(() => tempDirs.forEach((dir) => fs.rmSync(dir, { recursive: true, force: true })));

describe('loadConfig', () => {
  it('reports every missing path at once', () => {
    const result = loadConfig({});
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors).toHaveLength(2);
      expect(result.errors[0]).toContain('WATCH_DIR is not set');
      expect(result.errors[1]).toContain('OUTPUT_DIR is not set');
    }
  });

  it('treats blank values as not set', () => {
    const result = loadConfig({ WATCH_DIR: '   ', OUTPUT_DIR: '' });
    expect(result.ok).toBe(false);
  });

  it('rejects relative paths', () => {
    const result = loadConfig({ WATCH_DIR: 'videos', OUTPUT_DIR: makeDir() });
    expect(result).toEqual({ ok: false, errors: ['WATCH_DIR must be an absolute path, got "videos".'] });
  });

  it('rejects paths that do not exist and are not directories', () => {
    const dir = makeDir();
    const file = path.join(dir, 'a.txt');
    fs.writeFileSync(file, 'x');
    const missing = loadConfig({ WATCH_DIR: path.join(dir, 'nope'), OUTPUT_DIR: file });
    expect(missing.ok).toBe(false);
    if (!missing.ok) {
      expect(missing.errors[0]).toContain('does not exist');
      expect(missing.errors[1]).toContain('is not a directory');
    }
  });

  it('does not create a missing output directory', () => {
    const missing = path.join(makeDir(), 'out');
    loadConfig({ WATCH_DIR: makeDir(), OUTPUT_DIR: missing });
    expect(fs.existsSync(missing)).toBe(false);
  });

  (process.getuid?.() === 0 ? it.skip : it)('rejects a read-only output directory', () => {
    const output = makeDir();
    fs.chmodSync(output, 0o500);
    const result = loadConfig({ WATCH_DIR: makeDir(), OUTPUT_DIR: output });
    fs.chmodSync(output, 0o700);
    expect(result.ok).toBe(false);
  });

  it('accepts valid directories and trims optional values', () => {
    const watch = makeDir();
    const output = makeDir();
    const result = loadConfig({
      WATCH_DIR: `${watch}${path.sep}`,
      OUTPUT_DIR: output,
      HF_TOKEN: ' hf_x ',
      OPENROUTER_TOKEN: '',
      FFMPEG_PATH: '',
    });
    expect(result).toEqual({
      ok: true,
      config: {
        watchDir: watch,
        outputDir: output,
        hfToken: 'hf_x',
        openRouterToken: '',
        hfPolishModels: [],
        openRouterPolishModels: [],
        ffmpegPath: null,
        instancePort: 47631,
      },
    });
  });

  describe('instance port', () => {
    const base = () => ({ WATCH_DIR: makeDir(), OUTPUT_DIR: makeDir() });

    it('accepts a port from 1024 to 65535', () => {
      const result = loadConfig({ ...base(), INSTANCE_PORT: ' 50000 ' });
      expect(result.ok && result.config.instancePort).toBe(50000);
    });

    it.each(['80', '1023', '65536', 'abc', '4.5', '-1'])('rejects %s', (value) => {
      const result = loadConfig({ ...base(), INSTANCE_PORT: value });
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.errors[0]).toContain('INSTANCE_PORT');
    });
  });

  describe('polish models', () => {
    const base = () => ({ WATCH_DIR: makeDir(), OUTPUT_DIR: makeDir() });

    it('reads comma or whitespace separated model lists in order and drops duplicates', () => {
      const result = loadConfig({
        ...base(),
        HF_POLISH_MODELS: ' swiss-ai/Apertus-8B-Instruct-2509:publicai, org/other:provider\n org/other:provider ',
        OPENROUTER_POLISH_MODELS: 'google/gemma-4-26b-a4b-it:free',
      });
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.config.hfPolishModels).toEqual(['swiss-ai/Apertus-8B-Instruct-2509:publicai', 'org/other:provider']);
        expect(result.config.openRouterPolishModels).toEqual(['google/gemma-4-26b-a4b-it:free']);
      }
    });

    it('treats blank values as the default ladder', () => {
      const result = loadConfig({ ...base(), HF_POLISH_MODELS: '  ', OPENROUTER_POLISH_MODELS: '' });
      expect(result.ok && result.config.hfPolishModels).toEqual([]);
      expect(result.ok && result.config.openRouterPolishModels).toEqual([]);
    });

    it('rejects entries that are not org/model ids, naming the variable', () => {
      const result = loadConfig({ ...base(), HF_POLISH_MODELS: 'good/model, justaname', OPENROUTER_POLISH_MODELS: '/x' });
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.errors).toEqual([
          'HF_POLISH_MODELS has "justaname", which is not a model id like org/model[:provider].',
          'OPENROUTER_POLISH_MODELS has "/x", which is not a model id like org/model[:provider].',
        ]);
      }
    });
  });
});
