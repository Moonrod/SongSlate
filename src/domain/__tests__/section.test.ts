import {
  applySectionBuffer,
  cueTimecodeBase,
  formatShortTime,
  nextSectionIndex,
  sectionFileName,
  sectionFrameRange,
  sectionName,
  validateSection,
} from '../section';

describe('section names', () => {
  it('shows where the clip starts in the song', () => {
    expect(sectionName(1, 80)).toBe('TC 01 (1:20)');
    expect(sectionName(2, 145)).toBe('TC 02 (2:25)'); // 2:30 start with a 5 s buffer
    expect(sectionName(3, 13)).toBe('TC 03 (:13)');
    expect(sectionName(12, 0)).toBe('TC 12 (:00)');
  });

  it('formats start times, dropping frames', () => {
    expect(formatShortTime(0)).toBe(':00');
    expect(formatShortTime(29.9)).toBe(':29');
    expect(formatShortTime(60)).toBe('1:00');
    expect(formatShortTime(605)).toBe('10:05');
    expect(formatShortTime(3725)).toBe('62:05');
  });

  it('numbers after existing TC (and older Timecode) cues', () => {
    expect(nextSectionIndex([])).toBe(1);
    expect(nextSectionIndex([{ name: 'Verse' }, { name: 'Chorus' }])).toBe(1);
    expect(nextSectionIndex([{ name: 'TC 01 (1:20)' }, { name: 'tc 03 (:10)' }, { name: 'Song' }])).toBe(4);
    expect(nextSectionIndex([{ name: 'Timecode 04 (:30)' }, { name: 'TC 02 (1:00)' }])).toBe(5);
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

describe('applySectionBuffer', () => {
  it('adds the buffer on both sides', () => {
    expect(applySectionBuffer(72, 102, 5, 0, 204)).toEqual({ fileStart: 67, fileEnd: 107, before: 5, after: 5 });
  });

  it('stops at the start and end of the song', () => {
    expect(applySectionBuffer(3, 33, 5, 0, 204)).toEqual({ fileStart: 0, fileEnd: 38, before: 3, after: 5 });
    expect(applySectionBuffer(180, 202, 5, 0, 204)).toEqual({ fileStart: 175, fileEnd: 204, before: 5, after: 2 });
  });

  it('respects a section-of-a-section start', () => {
    expect(applySectionBuffer(74, 90, 5, 72, 120)).toEqual({ fileStart: 72, fileEnd: 95, before: 2, after: 5 });
  });

  it('is a no-op with no buffer', () => {
    expect(applySectionBuffer(10, 20, 0, 0, 100)).toEqual({ fileStart: 10, fileEnd: 20, before: 0, after: 0 });
  });
});
