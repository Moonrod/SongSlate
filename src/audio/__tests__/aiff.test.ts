import { decodeAiff, isAiffFileName, readExtended80 } from '../aiff';

/** 80-bit extended encoding of common sample rates. */
const RATE_44100 = [0x40, 0x0e, 0xac, 0x44, 0, 0, 0, 0, 0, 0];
const RATE_48000 = [0x40, 0x0e, 0xbb, 0x80, 0, 0, 0, 0, 0, 0];

function u32(n: number) {
  return [(n >>> 24) & 0xff, (n >>> 16) & 0xff, (n >>> 8) & 0xff, n & 0xff];
}
function u16(n: number) {
  return [(n >>> 8) & 0xff, n & 0xff];
}
function ascii(s: string) {
  return [...s].map((c) => c.charCodeAt(0));
}

function buildAiff(opts: {
  channels: number;
  bits: number;
  rate: number[];
  samples: number[]; // interleaved, already encoded as bytes
  aifc?: string;
  frames: number;
}): Uint8Array {
  const commBody = [
    ...u16(opts.channels),
    ...u32(opts.frames),
    ...u16(opts.bits),
    ...opts.rate,
    ...(opts.aifc ? [...ascii(opts.aifc), 0, 0] : []), // compression type + empty pstring (padded)
  ];
  const comm = [...ascii('COMM'), ...u32(commBody.length), ...commBody];
  const ssndBody = [...u32(0), ...u32(0), ...opts.samples];
  const ssnd = [...ascii('SSND'), ...u32(ssndBody.length), ...ssndBody, ...(ssndBody.length % 2 ? [0] : [])];
  const form = [...ascii(opts.aifc ? 'AIFC' : 'AIFF'), ...comm, ...ssnd];
  return new Uint8Array([...ascii('FORM'), ...u32(form.length), ...form]);
}

describe('readExtended80', () => {
  it('decodes standard sample rates', () => {
    const v = (b: number[]) => readExtended80(new DataView(new Uint8Array(b).buffer), 0);
    expect(v(RATE_44100)).toBe(44100);
    expect(v(RATE_48000)).toBe(48000);
    expect(v([0, 0, 0, 0, 0, 0, 0, 0, 0, 0])).toBe(0);
  });
});

describe('decodeAiff', () => {
  it('decodes 16-bit big-endian stereo', () => {
    // frame0: L=16384 (0.5), R=-32768 (-1); frame1: L=0, R=32767
    const samples = [0x40, 0x00, 0x80, 0x00, 0x00, 0x00, 0x7f, 0xff];
    const pcm = decodeAiff(buildAiff({ channels: 2, bits: 16, rate: RATE_44100, samples, frames: 2 }));
    expect(pcm.sampleRate).toBe(44100);
    expect(pcm.frameCount).toBe(2);
    expect(pcm.channels).toHaveLength(2);
    expect(pcm.channels[0][0]).toBeCloseTo(0.5);
    expect(pcm.channels[1][0]).toBe(-1);
    expect(pcm.channels[0][1]).toBe(0);
    expect(pcm.channels[1][1]).toBeCloseTo(32767 / 32768);
  });

  it('decodes 24-bit mono', () => {
    const samples = [0x40, 0x00, 0x00, 0xc0, 0x00, 0x00]; // 0.5, -0.5
    const pcm = decodeAiff(buildAiff({ channels: 1, bits: 24, rate: RATE_48000, samples, frames: 2 }));
    expect(pcm.sampleRate).toBe(48000);
    expect(Array.from(pcm.channels[0])).toEqual([0.5, -0.5]);
  });

  it("decodes little-endian AIFF-C 'sowt'", () => {
    const samples = [0x00, 0x40, 0x00, 0xc0]; // 0x4000, 0xC000 little-endian → 0.5, -0.5
    const pcm = decodeAiff(buildAiff({ channels: 1, bits: 16, rate: RATE_44100, samples, frames: 2, aifc: 'sowt' }));
    expect(Array.from(pcm.channels[0])).toEqual([0.5, -0.5]);
  });

  it('rejects non-AIFF data and compressed AIFF-C', () => {
    expect(() => decodeAiff(new Uint8Array([1, 2, 3]))).toThrow();
    expect(() => decodeAiff(new TextEncoder().encode('RIFF....WAVEfmt '))).toThrow(/FORM/);
    expect(() =>
      decodeAiff(buildAiff({ channels: 1, bits: 16, rate: RATE_44100, samples: [0, 0], frames: 1, aifc: 'ima4' })),
    ).toThrow(/compression/);
  });
});

describe('isAiffFileName', () => {
  it('matches AIFF extensions only', () => {
    expect(isAiffFileName('Song.AIF')).toBe(true);
    expect(isAiffFileName('song.aiff')).toBe(true);
    expect(isAiffFileName('song.aifc')).toBe(true);
    expect(isAiffFileName('song.wav')).toBe(false);
  });
});
