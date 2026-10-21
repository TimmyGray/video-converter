/** @jest-environment node */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { LedgerCorruptError, openLedger, type LedgerEntry } from '../../../service/ledger';

let dir: string;
let file: string;

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vf-ledger-'));
  file = path.join(dir, 'state.json');
});
afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

const entry = (overrides: Partial<LedgerEntry> = {}): LedgerEntry => ({
  path: '/in/a.mp4',
  size: 100,
  mtimeMs: 5,
  status: 'done',
  at: '2026-10-21T10:00:00.000Z',
  output: '/out/a.txt',
  ...overrides,
});

describe('openLedger', () => {
  it('starts empty when the file does not exist', () => {
    const ledger = openLedger(file);
    expect(ledger.counts()).toEqual({ done: 0, failed: 0, cancelled: 0 });
    expect(fs.existsSync(file)).toBe(false);
  });

  it('persists records so a new instance sees them, leaving no temp file', () => {
    openLedger(file).record(entry());
    const reopened = openLedger(file);
    expect(reopened.isProcessed({ path: '/in/a.mp4', size: 100, mtimeMs: 5 })).toBe(true);
    expect(fs.readdirSync(dir)).toEqual(['state.json']);
  });

  it('identifies a file by path, size and mtime together', () => {
    const ledger = openLedger(file);
    ledger.record(entry());
    expect(ledger.isProcessed({ path: '/in/a.mp4', size: 101, mtimeMs: 5 })).toBe(false);
    expect(ledger.isProcessed({ path: '/in/a.mp4', size: 100, mtimeMs: 6 })).toBe(false);
    expect(ledger.isProcessed({ path: '/in/b.mp4', size: 100, mtimeMs: 5 })).toBe(false);
  });

  it('counts entries per status', () => {
    const ledger = openLedger(file);
    ledger.record(entry());
    ledger.record(entry({ path: '/in/b.mp4', status: 'failed', output: null, error: 'boom' }));
    ledger.record(entry({ path: '/in/c.mp4', status: 'cancelled', output: null }));
    expect(ledger.counts()).toEqual({ done: 1, failed: 1, cancelled: 1 });
  });

  it('refuses to start on unparsable or wrongly shaped state', () => {
    fs.writeFileSync(file, '{not json');
    expect(() => openLedger(file)).toThrow(LedgerCorruptError);
    fs.writeFileSync(file, JSON.stringify({ entries: [{ path: 1 }] }));
    expect(() => openLedger(file)).toThrow(LedgerCorruptError);
    fs.writeFileSync(file, JSON.stringify({}));
    expect(() => openLedger(file)).toThrow(LedgerCorruptError);
  });
});
