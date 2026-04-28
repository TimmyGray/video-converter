import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';

const serverEntry = process.argv[2] ?? '.next/standalone/server.js';

if (!existsSync(serverEntry)) {
  console.error(`Server entry not found: ${serverEntry}`);
  process.exit(1);
}

const hostname = process.env.HOSTNAME && process.env.HOSTNAME !== '0.0.0.0'
  ? process.env.HOSTNAME
  : 'localhost';
const port = process.env.PORT ?? '3000';
const appUrl = `http://${hostname}:${port}`;

const server = spawn(process.execPath, [serverEntry], {
  stdio: 'inherit',
  env: process.env,
});

server.on('exit', (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  process.exit(code ?? 0);
});

const openInBrowser = () => {
  let command;
  let args;

  if (process.platform === 'win32') {
    command = 'cmd';
    args = ['/c', 'start', '', appUrl];
  } else if (process.platform === 'darwin') {
    command = 'open';
    args = [appUrl];
  } else {
    command = 'xdg-open';
    args = [appUrl];
  }

  const browserProcess = spawn(command, args, {
    detached: true,
    stdio: 'ignore',
  });

  browserProcess.unref();
};

setTimeout(openInBrowser, 1200);

const shutdown = (signal) => {
  if (!server.killed) {
    server.kill(signal);
  }
};

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
