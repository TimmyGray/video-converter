export type VideoFormat = 'mp4' | 'avi' | 'mov' | 'mkv' | 'webm' | 'gif';

export type ConversionStatus =
  | 'idle'
  | 'loading'
  | 'converting'
  | 'done'
  | 'error';

export interface ConversionJob {
  file: File | null;
  outputFormat: VideoFormat;
  status: ConversionStatus;
  progress: number;
  outputUrl: string | null;
  outputFileName: string | null;
  errorMessage: string | null;
}
