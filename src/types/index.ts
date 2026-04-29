export type VideoFormat = 'mp4' | 'avi' | 'mov' | 'mkv' | 'webm' | 'gif';

export type CropMode = 'none' | '9:16' | '16:9' | '4:3' | '3:4' | 'custom';

export interface CropSettings {
  mode: CropMode;
  custom: {
    width: string;
    height: string;
    x: string;
    y: string;
  };
}

export type ConversionStatus =
  | 'idle'
  | 'loading'
  | 'converting'
  | 'done'
  | 'error';

export interface ConversionJob {
  file: File | null;
  outputFormat: VideoFormat;
  cropSettings: CropSettings;
  status: ConversionStatus;
  progress: number;
  outputUrl: string | null;
  outputFileName: string | null;
  errorMessage: string | null;
}
