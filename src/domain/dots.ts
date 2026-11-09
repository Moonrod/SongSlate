import type { Cue } from './types';

/**
 * Markers shown in front of a cue's title on the slate: eight coloured dots,
 * then eight coloured squares for cues 9–16. Each cue gets its own, so no two
 * cues share one, which caps the cue list at 16. There is no green: it would
 * vanish on the green screen.
 */
export const DOTS = [
  { id: 'red', emoji: '🔴', label: 'Red dot' },
  { id: 'orange', emoji: '🟠', label: 'Orange dot' },
  { id: 'yellow', emoji: '🟡', label: 'Yellow dot' },
  { id: 'blue', emoji: '🔵', label: 'Blue dot' },
  { id: 'purple', emoji: '🟣', label: 'Purple dot' },
  { id: 'brown', emoji: '🟤', label: 'Brown dot' },
  { id: 'black', emoji: '⚫', label: 'Black dot' },
  { id: 'white', emoji: '⚪', label: 'White dot' },
  // Cues 9–16 get squares once the dots are used up (still no green).
  { id: 'sq-red', emoji: '🟥', label: 'Red square' },
  { id: 'sq-orange', emoji: '🟧', label: 'Orange square' },
  { id: 'sq-yellow', emoji: '🟨', label: 'Yellow square' },
  { id: 'sq-blue', emoji: '🟦', label: 'Blue square' },
  { id: 'sq-purple', emoji: '🟪', label: 'Purple square' },
  { id: 'sq-brown', emoji: '🟫', label: 'Brown square' },
  { id: 'sq-black', emoji: '⬛', label: 'Black square' },
  { id: 'sq-white', emoji: '⬜', label: 'White square' },
] as const;

/** One marker per cue, so the cue list holds at most this many cues. */
export const MAX_CUES = DOTS.length;

export type DotId = (typeof DOTS)[number]['id'];

const isDotId = (id: unknown): id is DotId => DOTS.some((d) => d.id === id);

/** First marker not already used (dots before squares). */
export function firstFreeDot(used: ReadonlySet<string>): DotId {
  const free = DOTS.find((d) => !used.has(d.id));
  return (free ?? DOTS[used.size % DOTS.length]).id;
}

/**
 * Gives every cue its own marker. Cues keep the one they have when it is valid
 * and not taken by an earlier cue; others (duplicates, the retired green dot,
 * none at all) get the first free one.
 */
export function assignUniqueDots<T extends Pick<Cue, 'dot'>>(cues: T[]): T[] {
  const used = new Set<string>();
  const keep = cues.map((c) => {
    if (isDotId(c.dot) && !used.has(c.dot)) {
      used.add(c.dot);
      return true;
    }
    return false;
  });
  let overflow = 0; // only past MAX_CUES, which the store prevents
  return cues.map((c, i) => {
    if (keep[i]) return c;
    const free = DOTS.find((d) => !used.has(d.id));
    const dot = free ? free.id : DOTS[overflow++ % DOTS.length].id;
    used.add(dot);
    return { ...c, dot };
  });
}

/** Markers used by cues other than `exceptCueId`. */
export function dotsInUse(cues: Pick<Cue, 'id' | 'dot'>[], exceptCueId?: string): Set<string> {
  return new Set(cues.filter((c) => c.id !== exceptCueId && c.dot).map((c) => c.dot as string));
}

export function cueDotEmoji(cue: Pick<Cue, 'dot'>): string {
  return DOTS.find((d) => d.id === cue.dot)?.emoji ?? '⚪';
}
