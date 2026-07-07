import { VideoFormat } from '@/types';

export function getCommandAttempts(
  inputName: string,
  inputFileName: string,
  outputFormat: VideoFormat,
  outputFileName: string,
  cropFilter: string | null
): string[][] {
  const filterArgs = cropFilter ? ['-vf', cropFilter] : [];

  if (outputFormat === 'mp3') {
    // Audio extraction uses a single deterministic profile to keep quality stable.
    return [['-i', inputName, '-vn', '-c:a', 'libmp3lame', '-b:a', '320k', outputFileName]];
  }

  if (outputFormat === 'webm') {
    const isWebmInput = /\.webm$/i.test(inputFileName);

    return [
      ...(isWebmInput && !cropFilter ? [['-i', inputName, '-c', 'copy', outputFileName]] : []),
      [
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
      ['-i', inputName, ...filterArgs, '-c:v', 'libvpx', '-c:a', 'libvorbis', outputFileName],
      ['-i', inputName, ...filterArgs, outputFileName],
    ];
  }

  return [
    ['-i', inputName, ...filterArgs, '-preset', 'ultrafast', outputFileName],
    ['-i', inputName, ...filterArgs, outputFileName],
  ];
}
