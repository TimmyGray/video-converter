import { TrimRange, VideoFormat } from '@/types';

/**
 * Input-side seek/duration args for a cut region. Placed before `-i` so FFmpeg seeks
 * without decoding the skipped part; when re-encoding the cut is still frame-accurate.
 */
export function getTrimInputArgs(trim: TrimRange | null | undefined): string[] {
  if (!trim) return [];
  const duration = trim.end - trim.start;
  return ['-ss', trim.start.toFixed(3), '-t', duration.toFixed(3)];
}

/**
 * Deterministic command to normalize any input to a 16 kHz mono PCM WAV, the
 * waveform format Whisper transcription expects. Kept separate from
 * getCommandAttempts so the video/audio command contract stays isolated.
 */
export function getWavNormalizeCommand(
  inputName: string,
  outputName: string,
  trim: TrimRange | null = null
): string[] {
  return [...getTrimInputArgs(trim), '-i', inputName, '-vn', '-ar', '16000', '-ac', '1', '-c:a', 'pcm_s16le', outputName];
}

export function getCommandAttempts(
  inputName: string,
  inputFileName: string,
  outputFormat: VideoFormat,
  outputFileName: string,
  cropFilter: string | null,
  trim: TrimRange | null = null
): string[][] {
  const filterArgs = cropFilter ? ['-vf', cropFilter] : [];
  const trimArgs = getTrimInputArgs(trim);

  if (outputFormat === 'mp3') {
    // Audio extraction uses a single deterministic profile: 128k VBR (ABR-targeted), 16-bit samples.
    return [
      [
        ...trimArgs,
        '-i',
        inputName,
        '-vn',
        '-c:a',
        'libmp3lame',
        '-b:a',
        '128k',
        '-abr',
        '1',
        '-sample_fmt',
        's16p',
        outputFileName,
      ],
    ];
  }

  if (outputFormat === 'webm') {
    const isWebmInput = /\.webm$/i.test(inputFileName);

    return [
      ...(isWebmInput && !cropFilter && !trim ? [['-i', inputName, '-c', 'copy', outputFileName]] : []),
      [
        ...trimArgs,
        '-i',
        inputName,
        ...filterArgs,
        '-c:v',
        'libvpx',
        '-deadline',
        'realtime',
        '-cpu-used',
        '8',
        '-crf',
        '36',
        '-b:v',
        '0',
        '-threads',
        '4',
        '-c:a',
        'libvorbis',
        '-q:a',
        '5',
        outputFileName,
      ],
      [...trimArgs, '-i', inputName, ...filterArgs, '-c:v', 'libvpx', '-c:a', 'libvorbis', outputFileName],
      [...trimArgs, '-i', inputName, ...filterArgs, outputFileName],
    ];
  }

  return [
    [...trimArgs, '-i', inputName, ...filterArgs, '-preset', 'ultrafast', outputFileName],
    [...trimArgs, '-i', inputName, ...filterArgs, outputFileName],
  ];
}
