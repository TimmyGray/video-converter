import fs from 'node:fs/promises';
import os from 'node:os';

export interface ResourceSample {
  cpuPercent: number;
  memUsedBytes: number;
  memTotalBytes: number;
  serviceRssBytes: number;
  diskFreeBytes: number | null;
  diskTotalBytes: number | null;
}

function cpuTimes() {
  let idle = 0;
  let total = 0;
  for (const { times } of os.cpus()) {
    idle += times.idle;
    total += times.user + times.nice + times.sys + times.idle + times.irq;
  }
  return { idle, total };
}

export function createResourceSampler(diskPath: string) {
  let previous = cpuTimes();
  let sample: ResourceSample = {
    cpuPercent: 0,
    memUsedBytes: os.totalmem() - os.freemem(),
    memTotalBytes: os.totalmem(),
    serviceRssBytes: process.memoryUsage().rss,
    diskFreeBytes: null,
    diskTotalBytes: null,
  };

  return {
    get: () => sample,
    refresh: async (): Promise<ResourceSample> => {
      const next = cpuTimes();
      const totalDelta = next.total - previous.total;
      const idleDelta = next.idle - previous.idle;
      previous = next;

      let diskFreeBytes: number | null = null;
      let diskTotalBytes: number | null = null;
      try {
        const stats = await fs.statfs(diskPath);
        diskFreeBytes = stats.bavail * stats.bsize;
        diskTotalBytes = stats.blocks * stats.bsize;
      } catch {
        // The output disk can vanish (unplugged drive); the dashboard shows "n/a".
      }

      sample = {
        cpuPercent: totalDelta > 0 ? Math.round((1 - idleDelta / totalDelta) * 100) : sample.cpuPercent,
        memUsedBytes: os.totalmem() - os.freemem(),
        memTotalBytes: os.totalmem(),
        serviceRssBytes: process.memoryUsage().rss,
        diskFreeBytes,
        diskTotalBytes,
      };
      return sample;
    },
  };
}
