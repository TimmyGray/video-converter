/** @jest-environment node */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pickOutputPath, removeStalePartials, writeTextAtomically } from '../../../service/output';

let dir: string;
beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vf-output-'));
});
afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

describe('pickOutputPath', () => {
  it('names the transcript after the video', async () => {
    expect(await pickOutputPath(dir, '/in/meeting.mp4')).toBe(path.join(dir, 'meeting.txt'));
  });

  it('never overwrites: adds a counter on collision', async () => {
    fs.writeFileSync(path.join(dir, 'meeting.txt'), 'old');
    expect(await pickOutputPath(dir, '/in/meeting.mkv')).toBe(path.join(dir, 'meeting (2).txt'));
    fs.writeFileSync(path.join(dir, 'meeting (2).txt'), 'old');
    expect(await pickOutputPath(dir, '/in/meeting.mp4')).toBe(path.join(dir, 'meeting (3).txt'));
  });
});

describe('writeTextAtomically', () => {
  it('leaves only the final file', async () => {
    const target = path.join(dir, 'a.txt');
    await writeTextAtomically(target, 'hello\n');
    expect(fs.readFileSync(target, 'utf8')).toBe('hello\n');
    expect(fs.readdirSync(dir)).toEqual(['a.txt']);
  });
});

describe('removeStalePartials', () => {
  it('removes interrupted writes and keeps everything else', async () => {
    fs.writeFileSync(path.join(dir, 'a.txt.partial'), 'x');
    fs.writeFileSync(path.join(dir, 'a.txt'), 'x');
    fs.writeFileSync(path.join(dir, 'other.partial'), 'x');
    await removeStalePartials(dir);
    expect(fs.readdirSync(dir).sort()).toEqual(['a.txt', 'other.partial']);
  });
});
