import { decodeWavToPcm16k, encodePcm16kToWav, pcm16kToWavBytes } from '@/utils/audioUtils';

interface FakeBufferConfig {
  sampleRate: number;
  numberOfChannels: number;
  data: Float32Array;
  duration: number;
}

let decodeResult: FakeBufferConfig;
let renderResult: Float32Array;

class FakeAudioBuffer {
  constructor(private config: FakeBufferConfig) {}
  get sampleRate() {
    return this.config.sampleRate;
  }
  get numberOfChannels() {
    return this.config.numberOfChannels;
  }
  get duration() {
    return this.config.duration;
  }
  getChannelData() {
    return this.config.data;
  }
}

class FakeOfflineAudioContext {
  constructor(public channels: number, public length: number, public sampleRate: number) {}
  decodeAudioData() {
    return Promise.resolve(new FakeAudioBuffer(decodeResult));
  }
  createBufferSource() {
    return { buffer: null, connect: () => {}, start: () => {} };
  }
  get destination() {
    return {};
  }
  startRendering() {
    return Promise.resolve(
      new FakeAudioBuffer({ sampleRate: 16000, numberOfChannels: 1, data: renderResult, duration: 1 })
    );
  }
}

beforeAll(() => {
  (window as unknown as { OfflineAudioContext: unknown }).OfflineAudioContext = FakeOfflineAudioContext;
});

describe('decodeWavToPcm16k', () => {
  it('returns the decoded channel directly when already 16 kHz mono', async () => {
    const data = new Float32Array([0.1, 0.2, 0.3]);
    decodeResult = { sampleRate: 16000, numberOfChannels: 1, data, duration: 1 };

    const result = await decodeWavToPcm16k({ arrayBuffer: () => Promise.resolve(new ArrayBuffer(8)) } as unknown as Blob);

    expect(result).toBe(data);
  });

  it('renders through an offline resample when sample rate differs', async () => {
    decodeResult = { sampleRate: 44100, numberOfChannels: 2, data: new Float32Array([1]), duration: 1 };
    renderResult = new Float32Array([0.5, 0.6]);

    const result = await decodeWavToPcm16k({ arrayBuffer: () => Promise.resolve(new ArrayBuffer(8)) } as unknown as Blob);

    expect(result).toBe(renderResult);
  });
});

describe('pcm16kToWavBytes', () => {
  const viewOf = (pcm: Float32Array) => new DataView(pcm16kToWavBytes(pcm).buffer);
  const readString = (view: DataView, offset: number, length: number) =>
    Array.from({ length }, (_, i) => String.fromCharCode(view.getUint8(offset + i))).join('');

  it('writes a canonical 16 kHz mono 16-bit PCM header', () => {
    const pcm = new Float32Array([0, 0.5, -0.5]);
    const view = viewOf(pcm);

    expect(readString(view, 0, 4)).toBe('RIFF');
    expect(readString(view, 8, 4)).toBe('WAVE');
    expect(readString(view, 12, 4)).toBe('fmt ');
    expect(readString(view, 36, 4)).toBe('data');
    expect(view.getUint16(20, true)).toBe(1); // PCM
    expect(view.getUint16(22, true)).toBe(1); // mono
    expect(view.getUint32(24, true)).toBe(16000); // sample rate
    expect(view.getUint16(34, true)).toBe(16); // bits per sample
    expect(view.getUint32(40, true)).toBe(pcm.length * 2); // data length
  });

  it('has byte length 44 + 2 per sample', () => {
    expect(pcm16kToWavBytes(new Float32Array(100)).byteLength).toBe(44 + 200);
  });

  it('clamps out-of-range samples to int16 bounds', () => {
    const view = viewOf(new Float32Array([2, -2]));
    expect(view.getInt16(44, true)).toBe(32767);
    expect(view.getInt16(46, true)).toBe(-32768);
  });
});

describe('encodePcm16kToWav', () => {
  it('wraps the PCM bytes in an audio/wav blob', () => {
    const blob = encodePcm16kToWav(new Float32Array(100));
    expect(blob.type).toBe('audio/wav');
    expect(blob.size).toBe(44 + 200);
  });
});
