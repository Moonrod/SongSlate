import { cueDotEmoji, DOTS, dotForIndex } from '../dots';

describe('cue dots', () => {
  it('rotates through the colours so neighbours differ', () => {
    expect(dotForIndex(0)).toBe('red');
    expect(dotForIndex(1)).toBe('orange');
    expect(dotForIndex(DOTS.length)).toBe('red');
    expect(dotForIndex(0)).not.toBe(dotForIndex(1));
  });

  it('uses the chosen dot, or one from the list position for older cues', () => {
    expect(cueDotEmoji({ dot: 'blue' }, 0)).toBe('🔵');
    expect(cueDotEmoji({}, 2)).toBe('🟡');
    expect(cueDotEmoji({}, -1)).toBe('🔴');
  });
});
