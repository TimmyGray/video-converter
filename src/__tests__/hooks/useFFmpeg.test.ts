import { getCommandAttempts } from '@/hooks/ffmpegCommandPlanner';

describe('getCommandAttempts', () => {
  it('uses a deterministic fixed-quality MP3 command profile', () => {
    const attempts = getCommandAttempts(
      'input.mp4',
      'source-video.mp4',
      'mp3',
      'output.mp3',
      "crop='if(gte(iw/ih,1.777),ih*1.777,iw)'"
    );

    expect(attempts).toEqual([
      ['-i', 'input.mp4', '-vn', '-c:a', 'libmp3lame', '-b:a', '320k', 'output.mp3'],
    ]);
  });

  it('keeps existing WebM retry attempt behavior', () => {
    const attempts = getCommandAttempts(
      'input.webm',
      'source.webm',
      'webm',
      'output.webm',
      null
    );

    expect(attempts.length).toBeGreaterThan(1);
    expect(attempts[0]).toEqual(['-i', 'input.webm', '-c', 'copy', 'output.webm']);
  });

  it('keeps non-MP3 fallback attempts intact', () => {
    const attempts = getCommandAttempts(
      'input.mov',
      'source.mov',
      'mp4',
      'output.mp4',
      null
    );

    expect(attempts).toEqual([
      ['-i', 'input.mov', '-preset', 'ultrafast', 'output.mp4'],
      ['-i', 'input.mov', 'output.mp4'],
    ]);
  });
});
