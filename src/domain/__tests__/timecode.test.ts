import {
  FRAME_RATE_IDS,
  formatDuration,
  formatParts,
  formatTimecode,
  framesToParts,
  framesToSeconds,
  parseTimecode,
  partsToFrames,
  secondsToFrames,
} from '../timecode';

describe('formatTimecode', () => {
  it('formats zero at every rate', () => {
    for (const rate of FRAME_RATE_IDS) {
      expect(formatTimecode(0, rate)).toBe('00:00:00:00');
    }
  });

  it('clamps negative / non-finite input to zero', () => {
    expect(formatTimecode(-3, '24')).toBe('00:00:00:00');
    expect(formatTimecode(Number.NaN, '25')).toBe('00:00:00:00');
  });

  it('formats integer rates exactly', () => {
    expect(formatTimecode(72, '24')).toBe('00:01:12:00');
    expect(formatTimecode(1.5, '24')).toBe('00:00:01:12');
    expect(formatTimecode(13 / 25, '25')).toBe('00:00:00:13');
    expect(formatTimecode(3599.99, '30')).toBe('00:59:59:29');
    expect(formatTimecode(3600, '30')).toBe('01:00:00:00');
  });

  it('shows the frame the playhead is inside (floors, never rounds up)', () => {
    expect(formatTimecode(1 / 24 - 0.001, '24')).toBe('00:00:00:00');
    expect(formatTimecode(1 / 24, '24')).toBe('00:00:00:01');
  });

  it('runs 23.976 at real NTSC speed (non-drop)', () => {
    // One real hour at 23.976 is 86313 frames → 00:59:56:09
    expect(secondsToFrames(3600, '23.976')).toBe(86313);
    expect(formatTimecode(3600, '23.976')).toBe('00:59:56:09');
  });

  it('runs 29.97 NDF slow and 29.97 DF in step with the clock', () => {
    expect(formatTimecode(3600, '29.97')).toBe('00:59:56:12');
    expect(formatTimecode(3600, '29.97', true)).toBe('01:00:00;00');
  });

  it('ignores drop-frame for rates that do not support it', () => {
    expect(formatTimecode(3600, '30', true)).toBe('01:00:00:00');
  });
});

describe('drop-frame counting (29.97)', () => {
  const df = (frames: number) => formatParts(framesToParts(frames, '29.97', true), true);

  it('skips frames 00 and 01 at the start of each non-tenth minute', () => {
    expect(df(1799)).toBe('00:00:59;29');
    expect(df(1800)).toBe('00:01:00;02');
    expect(df(3597)).toBe('00:01:59;29');
    expect(df(3598)).toBe('00:02:00;02');
  });

  it('does not skip on tenth minutes', () => {
    expect(df(17981)).toBe('00:09:59;29');
    expect(df(17982)).toBe('00:10:00;00');
    expect(df(17983)).toBe('00:10:00;01');
  });

  it('round-trips frames → parts → frames', () => {
    for (let f = 0; f < 200000; f += 7) {
      expect(partsToFrames(framesToParts(f, '29.97', true), '29.97', true)).toBe(f);
    }
  });
});

describe('round trips', () => {
  it.each(FRAME_RATE_IDS)('frames → parts → frames at %s', (rate) => {
    for (let f = 0; f < 300000; f += 131) {
      expect(partsToFrames(framesToParts(f, rate), rate)).toBe(f);
    }
  });

  it.each(FRAME_RATE_IDS)('frames → seconds → frames at %s is exact', (rate) => {
    for (let f = 0; f < 400000; f += 997) {
      expect(secondsToFrames(framesToSeconds(f, rate), rate)).toBe(f);
    }
  });

  it.each(FRAME_RATE_IDS)('parse(format(t)) lands on the same frame at %s', (rate) => {
    for (let t = 0; t < 4000; t += 3.217) {
      const text = formatTimecode(t, rate);
      const parsed = parseTimecode(text, rate)!;
      expect(formatTimecode(parsed, rate)).toBe(text);
    }
  });
});

describe('parseTimecode', () => {
  it('parses a cue start point so the counter starts there', () => {
    const s = parseTimecode('00:01:12:00', '23.976')!;
    expect(s).toBeCloseTo((1728 * 1001) / 24000, 9); // 72.072 s of real song time
    expect(formatTimecode(s, '23.976')).toBe('00:01:12:00');

    const s24 = parseTimecode('00:01:12:00', '24')!;
    expect(s24).toBe(72);
  });

  it('accepts shorter forms and plain seconds', () => {
    expect(parseTimecode('1:12', '24')).toBe(72);
    expect(parseTimecode('00:01:12', '25')).toBe(72);
    expect(parseTimecode('72', '30')).toBe(72);
    expect(parseTimecode(' 72.5 ', '30')).toBe(72.5);
    expect(parseTimecode('00:00:01;15', '29.97', true)).toBeCloseTo((45 * 1001) / 30000, 9);
  });

  it('rejects invalid input', () => {
    expect(parseTimecode('', '24')).toBeNull();
    expect(parseTimecode('abc', '24')).toBeNull();
    expect(parseTimecode('00:00:00:24', '24')).toBeNull(); // frame out of range
    expect(parseTimecode('00:00:00:25', '25')).toBeNull();
    expect(parseTimecode('00:61:00:00', '25')).toBeNull();
    expect(parseTimecode('00:00:60:00', '25')).toBeNull();
    expect(parseTimecode('1:2:3:4:5', '25')).toBeNull();
    // Non-existent drop-frame labels
    expect(parseTimecode('00:01:00;00', '29.97', true)).toBeNull();
    expect(parseTimecode('00:01:00;01', '29.97', true)).toBeNull();
    expect(parseTimecode('00:10:00;00', '29.97', true)).not.toBeNull();
  });
});

describe('formatDuration', () => {
  it('formats minutes, seconds and milliseconds', () => {
    expect(formatDuration(0)).toBe('0:00.000');
    expect(formatDuration(72.0721)).toBe('1:12.072');
    expect(formatDuration(3725.5)).toBe('62:05.500');
    expect(formatDuration(-1)).toBe('0:00.000');
  });
});
