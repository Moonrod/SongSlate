/**
 * Playback speed for a cut section. Varispeed: pitch follows speed, the usual way
 * performers lip-sync for slow-motion (2x F, shot at double frame rate) or
 * sped-up (2x S) shots. Timecode always stays in song time.
 */
export type CueSpeed = 1 | 2 | 0.5;

export const SPEEDS: { value: CueSpeed; label: string; description: string }[] = [
  { value: 1, label: '1x', description: 'Normal speed' },
  { value: 2, label: '2x F', description: 'Twice as fast' },
  { value: 0.5, label: '2x S', description: 'Half speed (twice as slow)' },
];

/** Badge shown with the timecode: "2x F", "2x S", or "" at normal speed. */
export function speedLabel(speed: number | undefined): string {
  if (speed === 2) return '2x F';
  if (speed === 0.5) return '2x S';
  return '';
}

/** Real-time length of playing `songSeconds` of audio at `speed`. */
export function realSeconds(songSeconds: number, speed: number | undefined): number {
  return songSeconds / (speed && speed > 0 ? speed : 1);
}
