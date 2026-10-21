import fs from 'node:fs';

export type LedgerStatus = 'done' | 'failed' | 'cancelled';

export interface FileIdentity {
  path: string;
  size: number;
  mtimeMs: number;
}

export interface LedgerEntry extends FileIdentity {
  status: LedgerStatus;
  at: string;
  output: string | null;
  error?: string;
}

export interface Ledger {
  isProcessed: (identity: FileIdentity) => boolean;
  record: (entry: LedgerEntry) => void;
  counts: () => Record<LedgerStatus, number>;
}

export class LedgerCorruptError extends Error {
  constructor(file: string, cause: unknown) {
    super(
      `The state file ${file} is unreadable (${cause instanceof Error ? cause.message : String(cause)}). ` +
        'Fix or delete it; it is not recreated automatically because that would reprocess every video.',
      { cause }
    );
    this.name = 'LedgerCorruptError';
  }
}

const keyOf = ({ path, size, mtimeMs }: FileIdentity) => `${path}\0${size}\0${mtimeMs}`;

function isEntry(value: unknown): value is LedgerEntry {
  const entry = value as Partial<LedgerEntry> | null;
  return (
    typeof entry === 'object' &&
    entry !== null &&
    typeof entry.path === 'string' &&
    typeof entry.size === 'number' &&
    typeof entry.mtimeMs === 'number' &&
    (entry.status === 'done' || entry.status === 'failed' || entry.status === 'cancelled')
  );
}

export function openLedger(file: string): Ledger {
  const entries = new Map<string, LedgerEntry>();

  if (fs.existsSync(file)) {
    try {
      const parsed = JSON.parse(fs.readFileSync(file, 'utf8')) as { entries?: unknown };
      if (!Array.isArray(parsed.entries) || !parsed.entries.every(isEntry)) {
        throw new Error('unexpected structure');
      }
      for (const entry of parsed.entries) entries.set(keyOf(entry), entry);
    } catch (err) {
      throw new LedgerCorruptError(file, err);
    }
  }

  const save = () => {
    const temp = `${file}.tmp`;
    fs.writeFileSync(temp, JSON.stringify({ version: 1, entries: [...entries.values()] }, null, 2));
    fs.renameSync(temp, file);
  };

  return {
    isProcessed: (identity) => entries.has(keyOf(identity)),
    record: (entry) => {
      entries.set(keyOf(entry), entry);
      save();
    },
    counts: () => {
      const counts: Record<LedgerStatus, number> = { done: 0, failed: 0, cancelled: 0 };
      for (const entry of entries.values()) counts[entry.status] += 1;
      return counts;
    },
  };
}
