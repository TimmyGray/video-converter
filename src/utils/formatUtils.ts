import { ConversionMode, VideoFormat } from '@/types';

export interface FormatInfo {
  label: string;
  extension: string;
  mimeType: string;
  color: string;
  description: string;
}

export const FORMAT_INFO: Record<VideoFormat, FormatInfo> = {
  mp4: {
    label: 'MP4',
    extension: 'mp4',
    mimeType: 'video/mp4',
    color: '#FF6B35',
    description: 'Most compatible format',
  },
  avi: {
    label: 'AVI',
    extension: 'avi',
    mimeType: 'video/x-msvideo',
    color: '#FF8C42',
    description: 'Windows standard format',
  },
  mov: {
    label: 'MOV',
    extension: 'mov',
    mimeType: 'video/quicktime',
    color: '#FFA500',
    description: 'Apple QuickTime format',
  },
  mkv: {
    label: 'MKV',
    extension: 'mkv',
    mimeType: 'video/x-matroska',
    color: '#FFB347',
    description: 'Matroska container',
  },
  webm: {
    label: 'WEBM',
    extension: 'webm',
    mimeType: 'video/webm',
    color: '#FFD700',
    description: 'Web-optimized format',
  },
  gif: {
    label: 'GIF',
    extension: 'gif',
    mimeType: 'image/gif',
    color: '#FF4500',
    description: 'Animated image format',
  },
  mp3: {
    label: 'MP3',
    extension: 'mp3',
    mimeType: 'audio/mpeg',
    color: '#64DD17',
    description: 'Audio extraction format',
  },
  txt: {
    label: 'TXT',
    extension: 'txt',
    mimeType: 'text/plain',
    color: '#4FC3F7',
    description: 'Plain text transcript',
  },
  srt: {
    label: 'SRT',
    extension: 'srt',
    mimeType: 'application/x-subrip',
    color: '#4DD0E1',
    description: 'SubRip subtitle file',
  },
  vtt: {
    label: 'VTT',
    extension: 'vtt',
    mimeType: 'text/vtt',
    color: '#4DB6AC',
    description: 'WebVTT subtitle file',
  },
};

export function getSupportedFormats(mode: ConversionMode = 'video'): VideoFormat[] {
  if (mode === 'audio-extraction') {
    return ['mp3'];
  }

  if (mode === 'transcription') {
    return ['txt', 'srt', 'vtt'];
  }

  return ['mp4', 'avi', 'mov', 'mkv', 'webm', 'gif'];
}

export function getFormatInfo(format: VideoFormat): FormatInfo {
  return FORMAT_INFO[format];
}

export function isValidVideoFile(file: File): boolean {
  return (
    file.type.startsWith('video/') ||
    file.name.match(/\.(mp4|avi|mov|mkv|webm|gif|flv|wmv|m4v|3gp)$/i) !== null
  );
}

export function getOutputFileName(
  inputName: string,
  format: VideoFormat,
  conversionMode: ConversionMode = 'video'
): string {
  const nameWithoutExt = inputName.replace(/\.[^/.]+$/, '');

  if (conversionMode === 'audio-extraction' && format === 'mp3') {
    const audioBaseName = nameWithoutExt.endsWith('_audio')
      ? nameWithoutExt.slice(0, -'_audio'.length)
      : nameWithoutExt;
    return `${audioBaseName}_audio.mp3`;
  }

  return `${nameWithoutExt}.${FORMAT_INFO[format].extension}`;
}
