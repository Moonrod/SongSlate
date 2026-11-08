import { formatDuration } from './timecode';
import type { Cue } from './types';

/** Shortest section that can be cut. */
export const MIN_SECTION_SECONDS = 0.5;

/**
 * Song-time offset of a cue's audio file: 0 for an imported song, the section's
 * start for a section cut from one. Add it to file positions for display/logging.
 */
export function cueTimecodeBase(cue: Pick<Cue, 'section'>): number {
  return cue.section?.startSeconds ?? 0;
}

/** Time shown in section names: ":45" under a minute, "1:20" from a minute up. */
export function formatShortTime(seconds: number): string {
  const total = Math.max(0, Math.floor(seconds + 1e-6));
  const m = Math.floor(total / 60);
  const s = String(total % 60).padStart(2, '0');
  return m > 0 ? `${m}:${s}` : `:${s}`;
}

/**
 * Suggested name: the number and where the clip starts in the song (buffer
 * included), e.g. sectionName(1, 80) → "Timecode 01 (1:20)".
 * `startWholeSeconds` is whole timecode seconds (frames dropped).
 */
export function sectionName(index: number, startWholeSeconds: number): string {
  return `Timecode ${String(index).padStart(2, '0')} (${formatShortTime(startWholeSeconds)})`;
}

/** Next free number after any existing "Timecode NN" cue names. */
export function nextSectionIndex(cues: Pick<Cue, 'name'>[]): number {
  let max = 0;
  for (const c of cues) {
    const m = /^Timecode\s+(\d+)/i.exec(c.name.trim());
    if (m) max = Math.max(max, Number(m[1]));
  }
  return max + 1;
}

/** Returns an error message, or null when the section is valid. */
export function validateSection(
  startSeconds: number | null,
  endSeconds: number | null,
  durationSeconds: number | null,
): string | null {
  if (startSeconds == null) return 'Enter a start timecode.';
  if (endSeconds == null) return 'Enter an end timecode.';
  if (endSeconds <= startSeconds) return 'The end must be after the start.';
  if (endSeconds - startSeconds < MIN_SECTION_SECONDS) return 'The section must be at least half a second long.';
  if (durationSeconds != null && startSeconds >= durationSeconds) {
    return `The start is past the end of the song (${formatDuration(durationSeconds)}).`;
  }
  if (durationSeconds != null && endSeconds > durationSeconds + 0.001) {
    return `The end is past the end of the song (${formatDuration(durationSeconds)}).`;
  }
  return null;
}

/** Sample-frame range for a section, clamped to the decoded audio. */
export function sectionFrameRange(
  startSeconds: number,
  endSeconds: number,
  sampleRate: number,
  totalFrames: number,
): { startFrame: number; endFrame: number } {
  const startFrame = Math.min(totalFrames, Math.max(0, Math.round(startSeconds * sampleRate)));
  const endFrame = Math.min(totalFrames, Math.max(startFrame, Math.round(endSeconds * sampleRate)));
  return { startFrame, endFrame };
}

/** Display file name for a section (the stored file uses an internal id). */
export function sectionFileName(name: string): string {
  const safe = name
    .replace(/[\\/\u0000-\u001f]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 80);
  return `${safe || 'Section'}.wav`;
}

/** Pre-roll/run-out added around a section when the buffer option is on. */
export const SECTION_BUFFER_SECONDS = 5;

/**
 * Extends a section by `buffer` seconds on each side, without going past the
 * song's start or end. Returns the file's extents and how much was really added.
 */
export function applySectionBuffer(
  startSeconds: number,
  endSeconds: number,
  buffer: number,
  songStart: number,
  songEnd: number | null,
): { fileStart: number; fileEnd: number; before: number; after: number } {
  const fileStart = Math.max(songStart, startSeconds - buffer);
  const fileEnd = songEnd == null ? endSeconds + buffer : Math.min(songEnd, endSeconds + buffer);
  return {
    fileStart,
    fileEnd,
    before: Math.max(0, startSeconds - fileStart),
    after: Math.max(0, fileEnd - endSeconds),
  };
}
