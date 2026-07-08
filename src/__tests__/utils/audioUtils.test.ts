import { decodeWavToPcm16k } from '@/utils/audioUtils';

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
