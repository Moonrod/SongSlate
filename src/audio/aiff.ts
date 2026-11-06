/**
 * Minimal AIFF / AIFF-C PCM decoder.
 *
 * iOS decodes AIFF natively, but Android's MediaExtractor (and miniaudio, the
 * fallback decoder in react-native-audio-api) do not. This lets SyncSlate play
 * AIFF files on Android by decoding them in JS into planar Float32 channels.
 *
 * Supports uncompressed big-endian PCM ('NONE'), little-endian PCM ('sowt'),
 * 8/16/24/32-bit integer samples, and 32/64-bit float ('fl32', 'fl64').
 */

export interface DecodedPcm {
  sampleRate: number;
  channels: Float32Array<ArrayBuffer>[];
  frameCount: number;
}

export class AiffError extends Error {}

function readId(view: DataView, offset: number): string {
  return String.fromCharCode(
    view.getUint8(offset),
    view.getUint8(offset + 1),
    view.getUint8(offset + 2),
    view.getUint8(offset + 3),
  );
}

/** IEEE 754 80-bit extended precision (big-endian), as used by AIFF COMM.sampleRate. */
export function readExtended80(view: DataView, offset: number): number {
  const b0 = view.getUint8(offset);
  const b1 = view.getUint8(offset + 1);
  const sign = b0 & 0x80 ? -1 : 1;
  const exponent = ((b0 & 0x7f) << 8) | b1;
  const hi = view.getUint32(offset + 2, false);
  const lo = view.getUint32(offset + 6, false);
  if (exponent === 0 && hi === 0 && lo === 0) return 0;
  if (exponent === 0x7fff) return sign * Infinity;
  const mantissa = hi * 2 ** 32 + lo;
  return sign * mantissa * 2 ** (exponent - 16383 - 63);
}

export function isAiffFileName(name: string): boolean {
  return /\.(aif|aiff|aifc)$/i.test(name);
}

export function decodeAiff(bytes: Uint8Array): DecodedPcm {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (bytes.byteLength < 12 || readId(view, 0) !== 'FORM') {
    throw new AiffError('Not an AIFF file (missing FORM header)');
  }
  const formType = readId(view, 8);
  if (formType !== 'AIFF' && formType !== 'AIFC') {
    throw new AiffError(`Unsupported FORM type ${formType}`);
  }

  let numChannels = 0;
  let numFrames = 0;
  let sampleSize = 0;
  let sampleRate = 0;
  let compression = 'NONE';
  let soundOffset = -1;
  let soundLength = 0;

  let pos = 12;
  while (pos + 8 <= bytes.byteLength) {
    const id = readId(view, pos);
    const size = view.getUint32(pos + 4, false);
    const data = pos + 8;
    if (id === 'COMM') {
      numChannels = view.getInt16(data, false);
      numFrames = view.getUint32(data + 2, false);
      sampleSize = view.getInt16(data + 6, false);
      sampleRate = readExtended80(view, data + 8);
      if (formType === 'AIFC' && size >= 22) {
        compression = readId(view, data + 18);
      }
    } else if (id === 'SSND') {
      const ssndOffset = view.getUint32(data, false);
      soundOffset = data + 8 + ssndOffset;
      soundLength = Math.min(size - 8 - ssndOffset, bytes.byteLength - soundOffset);
    }
    pos = data + size + (size % 2);
  }

  if (!numChannels || !sampleRate) throw new AiffError('Missing COMM chunk');
  if (soundOffset < 0) throw new AiffError('Missing SSND chunk');

  const comp = compression.toLowerCase();
  let littleEndian = false;
  let isFloat = false;
  if (comp === 'none' || comp === 'twos') {
    littleEndian = false;
  } else if (comp === 'sowt') {
    littleEndian = true;
  } else if (comp === 'fl32' || comp === 'fl64') {
    isFloat = true;
    sampleSize = comp === 'fl32' ? 32 : 64;
  } else {
    throw new AiffError(`Unsupported AIFF-C compression "${compression}"`);
  }

  const bytesPerSample = Math.ceil(sampleSize / 8);
  const frameBytes = bytesPerSample * numChannels;
  const frameCount = Math.min(numFrames, Math.floor(soundLength / frameBytes));
  const channels = Array.from({ length: numChannels }, () => new Float32Array(frameCount));

  for (let f = 0; f < frameCount; f++) {
    const base = soundOffset + f * frameBytes;
    for (let c = 0; c < numChannels; c++) {
      const o = base + c * bytesPerSample;
      let v: number;
      if (isFloat) {
        v = sampleSize === 32 ? view.getFloat32(o, false) : view.getFloat64(o, false);
      } else if (bytesPerSample === 1) {
        v = view.getInt8(o) / 128;
      } else if (bytesPerSample === 2) {
        v = view.getInt16(o, littleEndian) / 32768;
      } else if (bytesPerSample === 3) {
        const b0 = view.getUint8(o);
        const b1 = view.getUint8(o + 1);
        const b2 = view.getUint8(o + 2);
        let int = littleEndian ? (b2 << 16) | (b1 << 8) | b0 : (b0 << 16) | (b1 << 8) | b2;
        if (int & 0x800000) int -= 0x1000000;
        v = int / 8388608;
      } else if (bytesPerSample === 4) {
        v = view.getInt32(o, littleEndian) / 2147483648;
      } else {
        throw new AiffError(`Unsupported sample size ${sampleSize}`);
      }
      channels[c][f] = v;
    }
  }

  return { sampleRate, channels, frameCount };
}
