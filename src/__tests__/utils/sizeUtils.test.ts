import { formatFileSize } from '@/utils/sizeUtils';

describe('formatFileSize', () => {
  it('returns "0 Bytes" for 0', () => {
    expect(formatFileSize(0)).toBe('0 Bytes');
  });

  it('formats bytes', () => {
    expect(formatFileSize(500)).toBe('500 Bytes');
  });

  it('formats kilobytes', () => {
    expect(formatFileSize(1024)).toBe('1 KB');
  });

  it('formats megabytes', () => {
    expect(formatFileSize(1024 * 1024)).toBe('1 MB');
  });

  it('formats gigabytes', () => {
    expect(formatFileSize(1024 * 1024 * 1024)).toBe('1 GB');
  });

  it('respects decimal places', () => {
    expect(formatFileSize(1536, 1)).toBe('1.5 KB');
  });

  it('handles 0 decimals', () => {
    expect(formatFileSize(1536, 0)).toBe('2 KB');
  });
});
