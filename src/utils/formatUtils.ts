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
};

export function getSupportedFormats(mode: ConversionMode = 'video'): VideoFormat[] {
  if (mode === 'audio-extraction') {
    return ['mp3'];
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

export function getOutputFileName(inputName: string, format: VideoFormat): string {
  const nameWithoutExt = inputName.replace(/\.[^/.]+$/, '');
  return `${nameWithoutExt}.${FORMAT_INFO[format].extension}`;
}
