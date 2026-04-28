import { VideoFormat } from '@/types';

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
};

export function getSupportedFormats(): VideoFormat[] {
  return Object.keys(FORMAT_INFO) as VideoFormat[];
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
