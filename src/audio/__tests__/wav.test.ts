import { encodeWav16 } from '../wav';

const ascii = (b: Uint8Array, at: number) => String.fromCharCode(...b.slice(at, at + 4));

describe('encodeWav16', () => {
  it('writes a valid 16-bit PCM header', () => {
    const bytes = encodeWav16([new Float32Array(10), new Float32Array(10)], 48000);
    const v = new DataView(bytes.buffer);
    expect(bytes.length).toBe(44 + 10 * 2 * 2);
    expect(ascii(bytes, 0)).toBe('RIFF');
    expect(v.getUint32(4, true)).toBe(bytes.length - 8);
    expect(ascii(bytes, 8)).toBe('WAVE');
    expect(ascii(bytes, 12)).toBe('fmt ');
    expect(v.getUint16(20, true)).toBe(1); // PCM
    expect(v.getUint16(22, true)).toBe(2); // stereo
    expect(v.getUint32(24, true)).toBe(48000);
    expect(v.getUint32(28, true)).toBe(48000 * 4);
    expect(v.getUint16(32, true)).toBe(4);
    expect(v.getUint16(34, true)).toBe(16);
    expect(ascii(bytes, 36)).toBe('data');
    expect(v.getUint32(40, true)).toBe(40);
  });

  it('interleaves channels and scales/clips samples', () => {
    const left = Float32Array.from([0, 1, -1, 2]);
    const right = Float32Array.from([0.5, -0.5, 0, -3]);
    const v = new DataView(encodeWav16([left, right], 44100).buffer);
    const s = (i: number) => v.getInt16(44 + i * 2, true);
    expect([s(0), s(1)]).toEqual([0, 16384]);
    expect([s(2), s(3)]).toEqual([32767, -16384]);
    expect([s(4), s(5)]).toEqual([-32768, 0]);
    expect([s(6), s(7)]).toEqual([32767, -32768]); // clipped
  });

  it('rejects empty input', () => {
    expect(() => encodeWav16([], 44100)).toThrow();
  });
});
