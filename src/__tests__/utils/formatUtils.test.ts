import {
  getSupportedFormats,
  getFormatInfo,
  isValidVideoFile,
  isValidAudioFile,
  isValidSourceFile,
  getOutputFileName,
  FORMAT_INFO,
} from '@/utils/formatUtils';

describe('getSupportedFormats', () => {
  it('returns all 6 supported formats', () => {
    const formats = getSupportedFormats();
    expect(formats).toHaveLength(6);
    expect(formats).toContain('mp4');
    expect(formats).toContain('gif');
    expect(formats).not.toContain('mp3');
  });

  it('returns MP3 only for audio extraction mode', () => {
    expect(getSupportedFormats('audio-extraction')).toEqual(['mp3']);
  });

  it('returns txt/srt/vtt for transcription mode', () => {
    expect(getSupportedFormats('transcription')).toEqual(['txt', 'srt', 'vtt']);
  });
});

describe('getFormatInfo', () => {
  it('returns correct info for mp4', () => {
    const info = getFormatInfo('mp4');
    expect(info.label).toBe('MP4');
    expect(info.extension).toBe('mp4');
    expect(info.mimeType).toBe('video/mp4');
  });

  it('returns correct info for gif', () => {
    const info = getFormatInfo('gif');
    expect(info.label).toBe('GIF');
    expect(info.mimeType).toBe('image/gif');
  });

  it('returns correct info for mp3', () => {
    const info = getFormatInfo('mp3');
    expect(info.label).toBe('MP3');
    expect(info.extension).toBe('mp3');
    expect(info.mimeType).toBe('audio/mpeg');
  });
});

describe('isValidVideoFile', () => {
  const makeFile = (name: string, type: string) => new File([], name, { type });

  it('accepts video/* mime types', () => {
    expect(isValidVideoFile(makeFile('test.mp4', 'video/mp4'))).toBe(true);
  });

  it('accepts .mkv extension regardless of mime', () => {
    expect(isValidVideoFile(makeFile('test.mkv', 'application/octet-stream'))).toBe(true);
  });

  it('rejects non-video files', () => {
    expect(isValidVideoFile(makeFile('doc.pdf', 'application/pdf'))).toBe(false);
  });

  it('rejects image files', () => {
    expect(isValidVideoFile(makeFile('photo.jpg', 'image/jpeg'))).toBe(false);
  });
});

describe('isValidAudioFile', () => {
  const makeFile = (name: string, type: string) => new File([], name, { type });

  it('accepts audio/* mime types', () => {
    expect(isValidAudioFile(makeFile('podcast.mp3', 'audio/mpeg'))).toBe(true);
  });

  it('accepts common audio extensions regardless of mime', () => {
    for (const ext of ['mp3', 'wav', 'm4a', 'aac', 'ogg', 'oga', 'opus', 'flac', 'weba', 'wma']) {
      expect(isValidAudioFile(makeFile(`clip.${ext}`, 'application/octet-stream'))).toBe(true);
    }
  });

  it('rejects video files', () => {
    expect(isValidAudioFile(makeFile('test.mp4', 'video/mp4'))).toBe(false);
  });

  it('rejects non-media files', () => {
    expect(isValidAudioFile(makeFile('doc.pdf', 'application/pdf'))).toBe(false);
  });
});

describe('isValidSourceFile', () => {
  const makeFile = (name: string, type: string) => new File([], name, { type });
  const audio = makeFile('podcast.mp3', 'audio/mpeg');
  const video = makeFile('demo.mp4', 'video/mp4');
  const pdf = makeFile('doc.pdf', 'application/pdf');

  it('accepts audio only in transcription mode', () => {
    expect(isValidSourceFile(audio, 'transcription')).toBe(true);
    expect(isValidSourceFile(audio, 'video')).toBe(false);
    expect(isValidSourceFile(audio, 'audio-extraction')).toBe(false);
  });

  it('accepts video in every mode', () => {
    expect(isValidSourceFile(video, 'transcription')).toBe(true);
    expect(isValidSourceFile(video, 'video')).toBe(true);
    expect(isValidSourceFile(video, 'audio-extraction')).toBe(true);
  });

  it('rejects non-media files in every mode', () => {
    expect(isValidSourceFile(pdf, 'transcription')).toBe(false);
    expect(isValidSourceFile(pdf, 'video')).toBe(false);
    expect(isValidSourceFile(pdf, 'audio-extraction')).toBe(false);
  });

  it('defaults to video-only when mode is omitted', () => {
    expect(isValidSourceFile(audio)).toBe(false);
    expect(isValidSourceFile(video)).toBe(true);
  });
});

describe('getOutputFileName', () => {
  it('replaces extension with target format', () => {
    expect(getOutputFileName('video.mp4', 'avi')).toBe('video.avi');
  });

  it('handles files without extension', () => {
    expect(getOutputFileName('myvideo', 'mp4')).toBe('myvideo.mp4');
  });

  it('handles multi-dot filenames', () => {
    expect(getOutputFileName('my.video.file.mov', 'webm')).toBe('my.video.file.webm');
  });

  it('returns mp3 output extension for audio format', () => {
    expect(getOutputFileName('my.video.file.mov', 'mp3')).toBe('my.video.file.mp3');
  });

  it('swaps extension to transcript formats in transcription mode', () => {
    expect(getOutputFileName('demo.mov', 'txt', 'transcription')).toBe('demo.txt');
    expect(getOutputFileName('demo.mov', 'srt', 'transcription')).toBe('demo.srt');
    expect(getOutputFileName('demo.mov', 'vtt', 'transcription')).toBe('demo.vtt');
  });

  it('applies _audio.mp3 suffix in audio extraction mode', () => {
    expect(getOutputFileName('demo.mov', 'mp3', 'audio-extraction')).toBe('demo_audio.mp3');
  });

  it('applies _audio.mp3 suffix when source has no extension', () => {
    expect(getOutputFileName('demo', 'mp3', 'audio-extraction')).toBe('demo_audio.mp3');
  });

  it('keeps multi-dot names with _audio.mp3 suffix in audio extraction mode', () => {
    expect(getOutputFileName('demo.audio.mov', 'mp3', 'audio-extraction')).toBe('demo.audio_audio.mp3');
  });

  it('normalizes pre-normalized MP3 names without duplicate extension', () => {
    expect(getOutputFileName('demo.mp3', 'mp3', 'audio-extraction')).toBe('demo_audio.mp3');
  });

  it('does not duplicate _audio suffix for already normalized names', () => {
    expect(getOutputFileName('demo_audio.mp3', 'mp3', 'audio-extraction')).toBe('demo_audio.mp3');
  });
});

describe('FORMAT_INFO completeness', () => {
  it('every format has label, extension, mimeType, color, description', () => {
    for (const info of Object.values(FORMAT_INFO)) {
      expect(info.label).toBeTruthy();
      expect(info.extension).toBeTruthy();
      expect(info.mimeType).toBeTruthy();
      expect(info.color).toBeTruthy();
      expect(info.description).toBeTruthy();
    }
  });
});
