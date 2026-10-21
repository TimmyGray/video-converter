export function suspendProcess(child: { kill: (signal: NodeJS.Signals) => boolean } | null, suspend: boolean): void {
  if (!child || process.platform === 'win32') return;
  try {
    child.kill(suspend ? 'SIGSTOP' : 'SIGCONT');
  } catch {
    // The process already exited; there is nothing left to freeze.
  }
}
