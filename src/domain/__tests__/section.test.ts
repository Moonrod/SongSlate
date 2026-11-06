import {
  cueTimecodeBase,
  formatShortLength,
  nextSectionIndex,
  sectionFileName,
  sectionFrameRange,
  sectionName,
  validateSection,
} from '../section';

describe('section names', () => {
  it('matches the "Timecode 01 (:30)" convention', () => {
    expect(sectionName(1, 30)).toBe('Timecode 01 (:30)');
    expect(sectionName(2, 45.4)).toBe('Timecode 02 (:45)');
    expect(sectionName(12, 65)).toBe('Timecode 12 (1:05)');
    expect(sectionName(3, 5)).toBe('Timecode 03 (:05)');
  });

  it('formats short lengths', () => {
    expect(formatShortLength(0)).toBe(':00');
    expect(formatShortLength(29.6)).toBe(':30');
    expect(formatShortLength(60)).toBe('1:00');
    expect(formatShortLength(605)).toBe('10:05');
  });

  it('numbers after existing "Timecode NN" cues', () => {
    expect(nextSectionIndex([])).toBe(1);
    expect(nextSectionIndex([{ name: 'Verse' }, { name: 'Chorus' }])).toBe(1);
    expect(nextSectionIndex([{ name: 'Timecode 01 (:30)' }, { name: 'timecode 04 (:10)' }, { name: 'Song' }])).toBe(5);
  });

  it('makes a display file name', () => {
    expect(sectionFileName('Timecode 01 (:30)')).toBe('Timecode 01 (:30).wav');
    expect(sectionFileName('  a/b\\c  ')).toBe('a b c.wav');
    expect(sectionFileName(' / ')).toBe('Section.wav');
  });
});

describe('validateSection', () => {
  it('accepts a section inside the song', () => {
    expect(validateSection(30, 60, 200)).toBeNull();
    expect(validateSection(30, 200, 200)).toBeNull();
    expect(validateSection(0, 10, null)).toBeNull(); // length unknown until decoded
  });

  it('rejects missing, reversed, tiny and out-of-range sections', () => {
    expect(validateSection(null, 60, 200)).toMatch(/start/);
    expect(validateSection(30, null, 200)).toMatch(/end/);
    expect(validateSection(60, 30, 200)).toMatch(/after the start/);
    expect(validateSection(30, 30.2, 200)).toMatch(/half a second/);
    expect(validateSection(250, 260, 200)).toMatch(/start is past/);
    expect(validateSection(150, 260, 200)).toMatch(/end is past/);
  });
});

describe('sectionFrameRange', () => {
  it('converts seconds to sample frames and clamps to the audio', () => {
    expect(sectionFrameRange(1, 2, 48000, 480000)).toEqual({ startFrame: 48000, endFrame: 96000 });
    expect(sectionFrameRange(9, 20, 48000, 480000)).toEqual({ startFrame: 432000, endFrame: 480000 });
    expect(sectionFrameRange(-1, 0.5, 100, 1000)).toEqual({ startFrame: 0, endFrame: 50 });
  });
});

describe('cueTimecodeBase', () => {
  it('is the section start, or zero for a whole song', () => {
    expect(cueTimecodeBase({})).toBe(0);
    expect(
      cueTimecodeBase({ section: { sourceCueId: 'c', sourceName: 'S', sourceFileName: 's.wav', startSeconds: 72, endSeconds: 102 } }),
    ).toBe(72);
  });
});
