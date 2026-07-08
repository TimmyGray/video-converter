export type VideoFormat =
  | 'mp4'
  | 'avi'
  | 'mov'
  | 'mkv'
  | 'webm'
  | 'gif'
  | 'mp3'
  | 'txt'
  | 'srt'
  | 'vtt';

export type TranscriptFormat = 'txt' | 'srt' | 'vtt';

export type ConversionMode = 'video' | 'audio-extraction' | 'transcription';

/** A single Whisper output segment. `timestamp` is [startSeconds, endSeconds|null]. */
export interface TranscriptChunk {
  text: string;
  timestamp: [number, number | null];
}

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
  conversionMode: ConversionMode;
  outputFormat: VideoFormat;
  cropSettings: CropSettings;
  status: ConversionStatus;
  progress: number;
  outputUrl: string | null;
  outputFileName: string | null;
  outputSizeBytes: number | null;
  conversionDurationMs: number | null;
  ffmpegMode: 'multithreaded' | 'single-threaded' | null;
  performanceNote: string | null;
  errorMessage: string | null;
  // Transcription mode settings (inputs) and results.
  transcriptionLanguage: string | null;
  transcriptionTranslate: boolean;
  transcriptText: string | null;
  transcriptChunks: TranscriptChunk[] | null;
}
