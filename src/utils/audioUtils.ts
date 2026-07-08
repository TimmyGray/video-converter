const TARGET_SAMPLE_RATE = 16_000;

interface OfflineAudioContextCtor {
  new (numberOfChannels: number, length: number, sampleRate: number): OfflineAudioContext;
}

function getOfflineAudioContextCtor(): OfflineAudioContextCtor {
  const ctor =
    (typeof window !== 'undefined' &&
      (window.OfflineAudioContext ||
        (window as unknown as { webkitOfflineAudioContext?: OfflineAudioContextCtor })
          .webkitOfflineAudioContext)) ||
    undefined;

  if (!ctor) {
    throw new Error('Web Audio API (OfflineAudioContext) is not available in this runtime.');
  }

  return ctor as OfflineAudioContextCtor;
}

/**
 * Decodes an audio blob to a mono Float32Array at 16 kHz — the waveform format
 * Whisper expects. FFmpeg already normalizes to 16 kHz mono WAV upstream, so the
 * fast path returns the decoded channel directly; the render fallback covers any
 * other sample rate / channel count.
 */
export async function decodeWavToPcm16k(audio: Blob): Promise<Float32Array> {
  const arrayBuffer = await audio.arrayBuffer();
  const OfflineCtx = getOfflineAudioContextCtor();

  // decodeAudioData requires an owning context; a 1-frame context is enough to decode.
  const decodeContext = new OfflineCtx(1, 1, TARGET_SAMPLE_RATE);
  const audioBuffer = await decodeContext.decodeAudioData(arrayBuffer);

  if (audioBuffer.sampleRate === TARGET_SAMPLE_RATE && audioBuffer.numberOfChannels === 1) {
    return audioBuffer.getChannelData(0);
  }

  // Resample and downmix to 16 kHz mono via an offline render pass.
  const frameCount = Math.max(1, Math.ceil(audioBuffer.duration * TARGET_SAMPLE_RATE));
  const renderContext = new OfflineCtx(1, frameCount, TARGET_SAMPLE_RATE);
  const source = renderContext.createBufferSource();
  source.buffer = audioBuffer;
  source.connect(renderContext.destination);
  source.start(0);

  const rendered = await renderContext.startRendering();
  return rendered.getChannelData(0);
}
