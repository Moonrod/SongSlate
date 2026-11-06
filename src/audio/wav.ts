/**
 * Encodes planar Float32 channels as a 16-bit PCM WAV file. Used to write
 * sections cut from imported songs. WAV is lossless, decodes everywhere, and
 * needs no native encoder.
 */
export function encodeWav16(channels: Float32Array[], sampleRate: number): Uint8Array {
  const numChannels = channels.length;
  if (numChannels === 0) throw new Error('No audio channels to encode');
  const frames = channels[0].length;
  const blockAlign = numChannels * 2;
  const dataBytes = frames * blockAlign;
  const out = new Uint8Array(44 + dataBytes);
  const view = new DataView(out.buffer);
  const ascii = (offset: number, text: string) => {
    for (let i = 0; i < text.length; i++) view.setUint8(offset + i, text.charCodeAt(i));
  };
  const rate = Math.round(sampleRate);

  ascii(0, 'RIFF');
  view.setUint32(4, 36 + dataBytes, true);
  ascii(8, 'WAVE');
  ascii(12, 'fmt ');
  view.setUint32(16, 16, true); // fmt chunk size
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, numChannels, true);
  view.setUint32(24, rate, true);
  view.setUint32(28, rate * blockAlign, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, 16, true);
  ascii(36, 'data');
  view.setUint32(40, dataBytes, true);

  let o = 44;
  for (let f = 0; f < frames; f++) {
    for (let c = 0; c < numChannels; c++) {
      const v = Math.max(-1, Math.min(1, channels[c][f] || 0));
      view.setInt16(o, v < 0 ? Math.round(v * 32768) : Math.round(v * 32767), true);
      o += 2;
    }
  }
  return out;
}
