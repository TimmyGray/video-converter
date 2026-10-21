/** @jest-environment node */
import net from 'node:net';
import { acquireInstanceLock, describeRunningInstance, type InstanceInfo } from '../../../service/singleInstance';

const info = (overrides: Partial<InstanceInfo> = {}): InstanceInfo => ({
  app: 'videoforge-watch',
  pid: 4242,
  startedAt: '2026-10-21T10:00:00.000Z',
  watchDir: '/in',
  outputDir: '/out',
  ...overrides,
});

function freePort(): Promise<number> {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address() as net.AddressInfo;
      server.close(() => resolve(port));
    });
  });
}

const released: Array<() => Promise<void>> = [];
const foreign: net.Server[] = [];
afterEach(async () => {
  await Promise.all(released.splice(0).map((release) => release()));
  await Promise.all(foreign.splice(0).map((server) => new Promise((resolve) => server.close(resolve))));
});

async function take(port: number, details = info()) {
  const result = await acquireInstanceLock(port, details, 300);
  if (result.ok) released.push(result.release);
  return result;
}

describe('acquireInstanceLock', () => {
  it('gives the lock to the first instance and tells the second who holds it', async () => {
    const port = await freePort();
    expect((await take(port)).ok).toBe(true);

    const second = await take(port, info({ pid: 9999 }));
    expect(second).toEqual({ ok: false, reason: 'running', info: info() });
  });

  it('frees the lock on release so the next start succeeds', async () => {
    const port = await freePort();
    const first = await take(port);
    if (first.ok) await first.release();
    released.length = 0;
    expect((await take(port)).ok).toBe(true);
  });

  it('lets instances on different ports coexist', async () => {
    expect((await take(await freePort())).ok).toBe(true);
    expect((await take(await freePort())).ok).toBe(true);
  });

  it('does not mistake another program on the port for a running instance', async () => {
    const port = await freePort();
    const other = net.createServer((socket) => socket.end('HTTP/1.1 400 Bad Request\r\n\r\n'));
    foreign.push(other);
    await new Promise<void>((resolve) => other.listen(port, '127.0.0.1', resolve));
    expect(await take(port)).toEqual({ ok: false, reason: 'port-busy', port });
  });

  it('gives up on a program that accepts the connection but stays silent', async () => {
    const port = await freePort();
    const silent = net.createServer(() => undefined);
    foreign.push(silent);
    await new Promise<void>((resolve) => silent.listen(port, '127.0.0.1', resolve));
    expect(await take(port)).toEqual({ ok: false, reason: 'port-busy', port });
  });

  it('rejects an answer with the wrong app id', async () => {
    const port = await freePort();
    const impostor = net.createServer((socket) => socket.end(JSON.stringify({ app: 'something-else', pid: 1 })));
    foreign.push(impostor);
    await new Promise<void>((resolve) => impostor.listen(port, '127.0.0.1', resolve));
    expect(await take(port)).toEqual({ ok: false, reason: 'port-busy', port });
  });
});

describe('describeRunningInstance', () => {
  it('names the holder, its folders and how to stop it', () => {
    const lines = describeRunningInstance(info()).join('\n');
    expect(lines).toContain('already running');
    expect(lines).toContain('PID 4242');
    expect(lines).toContain('watching /in, saving to /out');
    expect(lines).toContain('Only one instance can run at a time');
  });
});
