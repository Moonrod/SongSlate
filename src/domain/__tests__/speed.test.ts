import { realSeconds, speedLabel, SPEEDS } from '../speed';

describe('section speed', () => {
  it('labels the timecode badge', () => {
    expect(speedLabel(2)).toBe('2x F');
    expect(speedLabel(0.5)).toBe('2x S');
    expect(speedLabel(1)).toBe('');
    expect(speedLabel(undefined)).toBe('');
  });

  it('offers normal, faster and slower', () => {
    expect(SPEEDS.map((s) => s.label)).toEqual(['1x', '2x F', '2x S']);
  });

  it('converts song time to real playing time', () => {
    expect(realSeconds(30, 2)).toBe(15);
    expect(realSeconds(30, 0.5)).toBe(60);
    expect(realSeconds(30, undefined)).toBe(30);
  });
});
