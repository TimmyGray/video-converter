import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';
import ffmpegStatic from 'ffmpeg-static';
import { polishTranscript } from '@/utils/hfPolish';
import { transcribeViaHf } from '@/utils/hfTranscribe';
import { polishViaOpenRouter } from '@/utils/openRouterPolish';
import { serializeTranscript } from '@/utils/subtitleUtils';
import { extractPcm } from './audio';
import { LEDGER_FILE_NAME, STABLE_MS, loadConfig } from './config';
import { createController } from './controller';
import { renderFrame, renderLogLine, type DashboardInfo } from './dashboard';
import { createNodeWhisperSession } from './localEngine';
import { LedgerCorruptError, openLedger } from './ledger';
import { pickOutputPath, removeStalePartials, writeTextAtomically } from './output';
import { transcribeVideo } from './pipeline';
import { createResourceSampler } from './resources';
import { createStabilityTracker, listVideos } from './scanner';

function fail(lines: string[]): never {
  console.error(['VideoForge Watch cannot start:', ...lines.map((line) => `  - ${line}`)].join('\n'));
  process.exit(1);
}

function loadDotEnv() {
  try {
    process.loadEnvFile(path.resolve('.env'));
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err;
  }
}

function describeEngine(hfToken: string, openRouterToken: string): string {
  const transcription = hfToken ? 'hosted Hugging Face, on-device fallback' : 'on-device only (no HF_TOKEN)';
  const polish = [hfToken && 'Hugging Face', openRouterToken && 'OpenRouter'].filter(Boolean).join(' + ');
  return `${transcription} | polish: ${polish || 'off'}`;
}

async function main() {
  loadDotEnv();

  const loaded = loadConfig(process.env);
  if (!loaded.ok) fail(loaded.errors);
  const { config } = loaded;

  const ffmpegPath = config.ffmpegPath ?? ffmpegStatic;
  if (!ffmpegPath || !fs.existsSync(ffmpegPath)) {
    fail([`ffmpeg binary not found${ffmpegPath ? `: ${ffmpegPath}` : ''}. Set FFMPEG_PATH in .env.`]);
  }

  let ledger;
  try {
    ledger = openLedger(path.join(config.outputDir, LEDGER_FILE_NAME));
  } catch (err) {
    if (err instanceof LedgerCorruptError) fail([err.message]);
    throw err;
  }
  await removeStalePartials(config.outputDir);

  const session = createNodeWhisperSession();
  const sampler = createResourceSampler(config.outputDir);
  await sampler.refresh();

  const controller = createController({
    ledger,
    tracker: createStabilityTracker(STABLE_MS),
    listVideos: () => listVideos(config.watchDir),
    now: Date.now,
    transcribe: (file, callbacks) =>
      transcribeVideo(
        file,
        {
          hfToken: config.hfToken,
          openRouterToken: config.openRouterToken,
          extractPcm: (input, options) => extractPcm(ffmpegPath, input, options),
          transcribeHosted: transcribeViaHf,
          localSession: session,
          polishHf: polishTranscript,
          polishOpenRouter: polishViaOpenRouter,
        },
        callbacks
      ),
    saveTranscript: async (videoPath, text) => {
      const target = await pickOutputPath(config.outputDir, videoPath);
      await writeTextAtomically(target, serializeTranscript('txt', text, []));
      return target;
    },
  });

  const info: DashboardInfo = {
    watchDir: config.watchDir,
    outputDir: config.outputDir,
    engine: describeEngine(config.hfToken, config.openRouterToken),
  };

  const interactive = Boolean(process.stdout.isTTY && process.stdin.isTTY);
  let drawnLines = 0;
  let drawScheduled = false;
  let lastPrinted: object | undefined;

  const draw = () => {
    drawScheduled = false;
    if (interactive) {
      const frame = renderFrame(controller.snapshot(), info, sampler.get(), Date.now(), process.stdout.columns || 80);
      const up = drawnLines > 0 ? `\x1b[${drawnLines}F` : '';
      process.stdout.write(`${up}${frame.map((line) => `\x1b[2K${line}`).join('\n')}\n`);
      drawnLines = frame.length;
      return;
    }
    const { log } = controller.snapshot();
    const start = lastPrinted ? log.indexOf(lastPrinted as (typeof log)[number]) + 1 : 0;
    for (const entry of log.slice(start)) console.log(renderLogLine(entry.kind, entry.message, entry.at));
    lastPrinted = log[log.length - 1];
  };

  controller.subscribe(() => {
    if (drawScheduled) return;
    drawScheduled = true;
    setTimeout(draw, 150);
  });

  const ticker = setInterval(() => {
    void sampler.refresh().then(draw);
  }, 1000);

  if (interactive) {
    process.stdout.write('\x1b[?25l');
    readline.emitKeypressEvents(process.stdin);
    process.stdin.setRawMode(true);
    process.stdin.resume();
  } else {
    console.log('No interactive terminal: hotkeys are disabled, stop the service with Ctrl+C.');
  }

  let quitting = false;
  const quit = () => {
    if (quitting) process.exit(1);
    quitting = true;
    controller.quit();
  };
  process.on('SIGINT', quit);
  process.on('SIGTERM', quit);
  process.stdin.on('keypress', (_text: string, key: { name?: string; ctrl?: boolean }) => {
    if (key.ctrl && key.name === 'c') return quit();
    if (key.name === 'c') controller.cancelCurrent();
    else if (key.name === 'p') controller.pause();
    else if (key.name === 's') controller.start();
    else if (key.name === 'q') quit();
  });

  draw();
  await controller.run();

  clearInterval(ticker);
  session.dispose();
  draw();
  if (interactive) {
    process.stdin.setRawMode(false);
    process.stdout.write('\x1b[?25h');
  }
  process.exit(0);
}

main().catch((err) => {
  process.stdout.write('\x1b[?25h');
  console.error(err);
  process.exit(1);
});
