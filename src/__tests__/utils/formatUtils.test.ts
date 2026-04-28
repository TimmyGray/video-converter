import {
  getSupportedFormats,
  getFormatInfo,
  isValidVideoFile,
  getOutputFileName,
  FORMAT_INFO,
} from '@/utils/formatUtils';

describe('getSupportedFormats', () => {
  it('returns all 6 supported formats', () => {
    const formats = getSupportedFormats();
    expect(formats).toHaveLength(6);
    expect(formats).toContain('mp4');
    expect(formats).toContain('gif');
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
