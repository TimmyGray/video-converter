import net from 'node:net';

export const DEFAULT_INSTANCE_PORT = 47631;
const APP_ID = 'videoforge-watch';
const PROBE_TIMEOUT_MS = 1_000;
const ACQUIRE_ATTEMPTS = 3;

export interface InstanceInfo {
  app: typeof APP_ID;
  pid: number;
  startedAt: string;
  watchDir: string;
  outputDir: string;
}

export type AcquireResult =
  | { ok: true; release: () => Promise<void> }
  | { ok: false; reason: 'running'; info: InstanceInfo }
  | { ok: false; reason: 'port-busy'; port: number }
  | { ok: false; reason: 'error'; error: Error };

function listen(port: number, info: InstanceInfo): Promise<net.Server> {
  return new Promise((resolve, reject) => {
    const server = net.createServer((socket) => {
      socket.on('error', () => undefined);
      socket.end(`${JSON.stringify(info)}\n`);
    });
    server.once('error', reject);
    server.listen(port, '127.0.0.1', () => {
      server.removeListener('error', reject);
      server.unref();
      resolve(server);
    });
  });
}

type Probe = { kind: 'instance'; info: InstanceInfo } | { kind: 'foreign' } | { kind: 'gone' };

function probe(port: number, timeoutMs: number): Promise<Probe> {
  return new Promise((resolve) => {
    let received = '';
    let settled = false;
    const socket = net.connect({ port, host: '127.0.0.1' });

    const finish = (result: Probe) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      resolve(result);
    };
    const parse = () => {
      try {
        const info = JSON.parse(received) as Partial<InstanceInfo>;
        return info.app === APP_ID ? finish({ kind: 'instance', info: info as InstanceInfo }) : finish({ kind: 'foreign' });
      } catch {
        return finish({ kind: 'foreign' });
      }
    };

    socket.setTimeout(timeoutMs, () => finish({ kind: 'foreign' }));
    socket.on('data', (chunk) => {
      received += chunk.toString('utf8');
      if (received.length > 4096) finish({ kind: 'foreign' });
    });
    socket.on('end', parse);
    socket.on('error', (err: NodeJS.ErrnoException) => finish(err.code === 'ECONNREFUSED' ? { kind: 'gone' } : { kind: 'foreign' }));
  });
}

/**
 * Holds a loopback TCP port for as long as this process lives. The operating system frees it on any
 * exit, including a kill or a power loss, so unlike a lock file it can never go stale; a second
 * start finds the port taken and asks the holder who it is.
 */
export async function acquireInstanceLock(
  port: number,
  info: InstanceInfo,
  probeTimeoutMs = PROBE_TIMEOUT_MS
): Promise<AcquireResult> {
  for (let attempt = 0; attempt < ACQUIRE_ATTEMPTS; attempt++) {
    try {
      const server = await listen(port, info);
      return {
        ok: true,
        release: () => new Promise<void>((resolve) => server.close(() => resolve())),
      };
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== 'EADDRINUSE') return { ok: false, reason: 'error', error: err as Error };
    }

    const holder = await probe(port, probeTimeoutMs);
    if (holder.kind === 'instance') return { ok: false, reason: 'running', info: holder.info };
    if (holder.kind === 'foreign') return { ok: false, reason: 'port-busy', port };
  }
  return { ok: false, reason: 'port-busy', port };
}

export function describeRunningInstance(info: InstanceInfo): string[] {
  return [
    'VideoForge Watch is already running:',
    `  - PID ${info.pid}, started ${new Date(info.startedAt).toLocaleString()}`,
    `  - watching ${info.watchDir}, saving to ${info.outputDir}`,
    'Only one instance can run at a time. Stop it first (press q in its terminal), then start again.',
  ];
}
