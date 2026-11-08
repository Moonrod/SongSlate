import { audioEngine } from '../audio/SlateAudioEngine';
import { encodeWav16 } from '../audio/wav';
import {
  applySectionBuffer,
  cueTimecodeBase,
  sectionFileName,
  sectionFrameRange,
  validateSection,
} from '../domain/section';
import type { Cue } from '../domain/types';
import { makeId } from '../utils/id';
import { cueFileUri, saveGeneratedAudio } from './audioFiles';

export interface CreateSectionInput {
  source: Cue;
  /** Section start/end in the source song's timecode (seconds). */
  startSeconds: number;
  endSeconds: number;
  name: string;
  /** Extra seconds of the song to include before and after the section (0 = none). */
  bufferSeconds?: number;
}

/**
 * Cuts [start, end) out of an imported song into a new WAV file and returns a
 * cue for it. The new cue remembers where it came from, so the slate shows the
 * original song's timecode while it plays.
 */
export async function createSection({
  source,
  startSeconds,
  endSeconds,
  name,
  bufferSeconds = 0,
}: CreateSectionInput): Promise<Cue> {
  // Sections of sections are measured in the original song's time.
  const base = cueTimecodeBase(source);
  const error = validateSection(
    startSeconds,
    endSeconds,
    source.durationSeconds != null ? base + source.durationSeconds : null,
  );
  if (error) throw new Error(error);
  if (startSeconds < base) throw new Error('The start is before the beginning of this cue.');

  const pcm = await audioEngine.decodePcm(cueFileUri(source), source.originalFileName);
  const totalFrames = pcm.channels[0]?.length ?? 0;
  const songEnd = base + totalFrames / pcm.sampleRate;
  const lateError = validateSection(startSeconds, endSeconds, songEnd);
  if (lateError) throw new Error(lateError);
  // The file runs from the buffered start to the buffered end, clamped to the song.
  const { fileStart, fileEnd, before, after } = applySectionBuffer(
    startSeconds,
    Math.min(endSeconds, songEnd),
    bufferSeconds,
    base,
    songEnd,
  );
  const { startFrame, endFrame } = sectionFrameRange(
    fileStart - base,
    fileEnd - base,
    pcm.sampleRate,
    totalFrames,
  );
  if (endFrame - startFrame <= 0) throw new Error('The section is outside the song.');

  const slice = pcm.channels.map((ch) => ch.slice(startFrame, endFrame));
  const bytes = encodeWav16(slice, pcm.sampleRate);
  const storedFileName = await saveGeneratedAudio(bytes, 'wav');

  const durationSeconds = (endFrame - startFrame) / pcm.sampleRate;
  // Keep the timecode exactly as typed. Snapping to the nearest sample can land a
  // few microseconds before a frame boundary, which would read as the previous frame.
  const original = source.section;
  return {
    id: makeId('c_'),
    name,
    storedFileName,
    originalFileName: sectionFileName(name),
    durationSeconds,
    startMode: 'full',
    startSeconds: 0,
    section: {
      sourceCueId: original?.sourceCueId ?? source.id,
      sourceName: original?.sourceName ?? source.name,
      sourceFileName: original?.sourceFileName ?? source.originalFileName,
      startSeconds: fileStart,
      endSeconds: fileEnd,
      ...(before > 0 || after > 0 ? { bufferBefore: before, bufferAfter: after } : {}),
    },
  };
}
