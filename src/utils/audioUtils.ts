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

/**
 * Encodes a mono 16 kHz Float32 waveform into canonical 16-bit PCM WAV bytes
 * (44-byte header + int16 samples). Returns raw bytes so callers can base64-encode
 * without depending on `Blob.arrayBuffer` (absent in some runtimes/jsdom).
 */
export function pcm16kToWavBytes(pcm: Float32Array): Uint8Array {
  const numSamples = pcm.length;
  const dataLength = numSamples * 2;
  const buffer = new ArrayBuffer(44 + dataLength);
  const view = new DataView(buffer);

  const writeString = (offset: number, text: string) => {
    for (let i = 0; i < text.length; i++) view.setUint8(offset + i, text.charCodeAt(i));
  };

  writeString(0, 'RIFF');
  view.setUint32(4, 36 + dataLength, true);
  writeString(8, 'WAVE');
  writeString(12, 'fmt ');
  view.setUint32(16, 16, true); // PCM fmt chunk size
  view.setUint16(20, 1, true); // audio format: PCM
  view.setUint16(22, 1, true); // channels: mono
  view.setUint32(24, TARGET_SAMPLE_RATE, true);
  view.setUint32(28, TARGET_SAMPLE_RATE * 2, true); // byte rate = sampleRate * blockAlign
  view.setUint16(32, 2, true); // block align = channels * bytesPerSample
  view.setUint16(34, 16, true); // bits per sample
  writeString(36, 'data');
  view.setUint32(40, dataLength, true);

  for (let i = 0; i < numSamples; i++) {
    const clamped = Math.max(-1, Math.min(1, pcm[i]));
    view.setInt16(44 + i * 2, clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff, true);
  }

  return new Uint8Array(buffer);
}

/**
 * Packages a mono 16 kHz Float32 waveform as a self-contained WAV blob for the
 * Hugging Face hosted transcription API.
 */
export function encodePcm16kToWav(pcm: Float32Array): Blob {
  return new Blob([pcm16kToWavBytes(pcm).buffer as ArrayBuffer], { type: 'audio/wav' });
}
