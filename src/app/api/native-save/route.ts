import { spawn } from 'node:child_process';
import { writeFile } from 'node:fs/promises';
import { platform } from 'node:os';
import { basename, join } from 'node:path';
import { NextResponse } from 'next/server';

export const runtime = 'nodejs';

interface NativeSaveCapability {
  available: boolean;
  reason?: string;
}

interface NativeSaveResponse {
  saved: boolean;
  cancelled?: boolean;
  error?: string;
}

interface CommandResult {
  code: number | null;
  stdout: string;
  stderr: string;
}

function sanitizeFileName(fileName: string): string {
  const cleaned = basename(fileName || '').trim();
  return cleaned.length > 0 ? cleaned : 'converted-output.bin';
}

function runCommand(command: string, args: string[], env: NodeJS.ProcessEnv = {}): Promise<CommandResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      env: { ...process.env, ...env },
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString();
    });

    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });

    child.on('error', reject);
    child.on('close', (code) => {
      resolve({ code, stdout, stderr });
    });
  });
}

async function canUseNativeDialog(): Promise<NativeSaveCapability> {
  const currentPlatform = platform();

  if (currentPlatform === 'win32') {
    return { available: true };
  }

  if (currentPlatform === 'darwin') {
    try {
      const probe = await runCommand('osascript', ['-e', 'return "ok"']);
      if (probe.code === 0) return { available: true };
      return { available: false, reason: 'Native save dialog command is unavailable on this macOS runtime.' };
    } catch {
      return { available: false, reason: 'Native save dialog command is unavailable on this macOS runtime.' };
    }
  }

  if (currentPlatform === 'linux') {
    try {
      const probe = await runCommand('sh', ['-lc', 'command -v zenity >/dev/null 2>&1']);
      if (probe.code === 0) return { available: true };
      return { available: false, reason: 'Install zenity to enable native save dialogs on Linux.' };
    } catch {
      return { available: false, reason: 'Install zenity to enable native save dialogs on Linux.' };
    }
  }

  return { available: false, reason: 'Native save dialog is unavailable on this platform.' };
}

async function pickSavePathWindows(defaultFileName: string): Promise<string | null> {
  const script = [
    '$ErrorActionPreference = "Stop"',
    'Add-Type -AssemblyName System.Windows.Forms',
    '$dialog = New-Object System.Windows.Forms.SaveFileDialog',
    '$dialog.Title = "Save Converted File"',
    '$dialog.FileName = [System.IO.Path]::GetFileName($env:VF_DEFAULT_NAME)',
    'if ($dialog.ShowDialog() -eq [System.Windows.Forms.DialogResult]::OK) { Write-Output $dialog.FileName }',
  ].join('; ');

  const result = await runCommand(
    'powershell',
    ['-NoProfile', '-NonInteractive', '-STA', '-ExecutionPolicy', 'Bypass', '-Command', script],
    { VF_DEFAULT_NAME: defaultFileName }
  );

  if (result.code !== 0) {
    throw new Error(result.stderr.trim() || 'Failed to open Windows native save dialog.');
  }

  const selectedPath = result.stdout.trim();
  return selectedPath.length > 0 ? selectedPath : null;
}

async function pickSavePathMac(defaultFileName: string): Promise<string | null> {
  const script = [
    '-e',
    'set suggestedName to system attribute "VF_DEFAULT_NAME"',
    '-e',
    'try',
    '-e',
    'set chosenFile to choose file name with prompt "Save Converted File" default name suggestedName',
    '-e',
    'return POSIX path of chosenFile',
    '-e',
    'on error number -128',
    '-e',
    'return ""',
    '-e',
    'end try',
  ];

  const result = await runCommand('osascript', script, { VF_DEFAULT_NAME: defaultFileName });
  if (result.code !== 0) {
    throw new Error(result.stderr.trim() || 'Failed to open macOS native save dialog.');
  }

  const selectedPath = result.stdout.trim();
  return selectedPath.length > 0 ? selectedPath : null;
}

async function pickSavePathLinux(defaultFileName: string): Promise<string | null> {
  const defaultPath = join(process.env.HOME || process.cwd(), defaultFileName);
  const result = await runCommand('zenity', [
    '--file-selection',
    '--save',
    '--confirm-overwrite',
    '--title=Save Converted File',
    `--filename=${defaultPath}`,
  ]);

  if (result.code === 1) {
    return null;
  }

  if (result.code !== 0) {
    throw new Error(result.stderr.trim() || 'Failed to open Linux native save dialog.');
  }

  const selectedPath = result.stdout.trim();
  return selectedPath.length > 0 ? selectedPath : null;
}

async function pickSavePath(defaultFileName: string): Promise<string | null> {
  const currentPlatform = platform();

  if (currentPlatform === 'win32') {
    return pickSavePathWindows(defaultFileName);
  }

  if (currentPlatform === 'darwin') {
    return pickSavePathMac(defaultFileName);
  }

  if (currentPlatform === 'linux') {
    return pickSavePathLinux(defaultFileName);
  }

  return null;
}

export async function GET(): Promise<NextResponse<NativeSaveCapability>> {
  const capability = await canUseNativeDialog();
  return NextResponse.json(capability);
}

export async function POST(request: Request): Promise<NextResponse<NativeSaveResponse>> {
  try {
    const capability = await canUseNativeDialog();
    if (!capability.available) {
      return NextResponse.json(
        {
          saved: false,
          error: capability.reason || 'Native save dialog is not available in this runtime.',
        },
        { status: 400 }
      );
    }

    const formData = await request.formData();
    const fileField = formData.get('file');
    const fileNameField = formData.get('fileName');

    if (!(fileField instanceof File)) {
      return NextResponse.json({ saved: false, error: 'Missing file payload.' }, { status: 400 });
    }

    if (typeof fileNameField !== 'string') {
      return NextResponse.json({ saved: false, error: 'Missing output file name.' }, { status: 400 });
    }

    const safeFileName = sanitizeFileName(fileNameField);
    const selectedPath = await pickSavePath(safeFileName);

    if (!selectedPath) {
      return NextResponse.json({ saved: false, cancelled: true });
    }

    const bytes = Buffer.from(await fileField.arrayBuffer());
    await writeFile(selectedPath, bytes);

    return NextResponse.json({ saved: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Native save failed.';
    return NextResponse.json({ saved: false, error: message }, { status: 500 });
  }
}
