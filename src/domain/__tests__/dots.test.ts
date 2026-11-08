import { assignUniqueDots, cueDotEmoji, DOTS, dotsInUse, firstFreeDot, type DotId } from '../dots';

describe('cue markers', () => {
  it('has no green and no duplicates', () => {
    const emojis: string[] = DOTS.map((d) => d.emoji);
    expect(DOTS.some((d) => d.id.includes('green'))).toBe(false);
    expect(emojis).not.toContain('🟢');
    expect(emojis).not.toContain('🟩');
    expect(DOTS).toHaveLength(8);
    expect(emojis.every((e) => !['🟥', '🟧', '🟨', '🟦', '🟪', '🟫', '⬛', '⬜'].includes(e))).toBe(true);
    expect(new Set(DOTS.map((d) => d.emoji)).size).toBe(DOTS.length);
  });

  it('picks the first unused marker', () => {
    expect(firstFreeDot(new Set())).toBe('red');
    expect(firstFreeDot(new Set(['red', 'orange']))).toBe('yellow');
  });

  it('gives every cue its own marker, keeping valid ones', () => {
    const cues = assignUniqueDots([
      { dot: 'blue' as const },
      { dot: 'blue' as const }, // duplicate → reassigned
      { dot: 'green' as never }, // retired green → reassigned
      {}, // none → assigned
      { dot: 'red' as const },
    ]);
    const dots = cues.map((c) => c.dot);
    expect(dots[0]).toBe('blue');
    expect(dots[4]).toBe('red');
    expect(new Set(dots).size).toBe(5);
    expect(dots).not.toContain('green');
  });

  it('stays unique for as many cues as there are markers', () => {
    const cues = assignUniqueDots(Array.from({ length: DOTS.length }, (): { dot?: DotId } => ({})));
    expect(new Set(cues.map((c) => c.dot)).size).toBe(DOTS.length);
  });

  it('repeats colours in order once there are more than eight cues', () => {
    const cues = assignUniqueDots(Array.from({ length: 10 }, (): { dot?: DotId } => ({})));
    expect(new Set(cues.slice(0, 8).map((c) => c.dot)).size).toBe(8);
    expect(cues[8].dot).toBe('red');
    expect(cues[9].dot).toBe('orange');
  });

  it('reports markers used by other cues', () => {
    const used = dotsInUse([{ id: 'a', dot: 'red' }, { id: 'b', dot: 'blue' }], 'a');
    expect([...used]).toEqual(['blue']);
  });

  it('maps a marker to its emoji', () => {
    expect(cueDotEmoji({ dot: 'blue' })).toBe('🔵');
    expect(cueDotEmoji({ dot: 'sq-red' as never })).toBe('⚪'); // retired square
  });

  it('replaces retired squares with free dots', () => {
    const cues = assignUniqueDots([{ dot: 'red' as const }, { dot: 'sq-red' as never }]);
    expect(cues.map((c) => c.dot)).toEqual(['red', 'orange']);
  });
});
