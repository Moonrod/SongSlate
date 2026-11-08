import type { Cue } from './types';

/** Coloured-dot emoji shown in front of a cue's title on the slate. */
export const DOTS = [
  { id: 'red', emoji: '🔴', label: 'Red' },
  { id: 'orange', emoji: '🟠', label: 'Orange' },
  { id: 'yellow', emoji: '🟡', label: 'Yellow' },
  { id: 'green', emoji: '🟢', label: 'Green' },
  { id: 'blue', emoji: '🔵', label: 'Blue' },
  { id: 'purple', emoji: '🟣', label: 'Purple' },
  { id: 'brown', emoji: '🟤', label: 'Brown' },
  { id: 'black', emoji: '⚫', label: 'Black' },
  { id: 'white', emoji: '⚪', label: 'White' },
] as const;

export type DotId = (typeof DOTS)[number]['id'];

/** Dot for the n-th cue added, rotating so neighbouring cues differ. */
export function dotForIndex(index: number): DotId {
  return DOTS[((index % DOTS.length) + DOTS.length) % DOTS.length].id;
}

/** The cue's dot emoji. Cues saved before dots existed get one from their list position. */
export function cueDotEmoji(cue: Pick<Cue, 'dot'>, index: number): string {
  const found = DOTS.find((d) => d.id === cue.dot);
  return (found ?? DOTS.find((d) => d.id === dotForIndex(Math.max(0, index)))!).emoji;
}
