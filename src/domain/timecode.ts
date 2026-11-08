import type { FrameRateId } from './types';

export interface FrameRateInfo {
  id: FrameRateId;
  /** Integer frames per timecode-second (the FF field rolls over at this). */
  timebase: number;
  /** Real frames per wall-clock second. */
  fps: number;
  /** Whether drop-frame counting is available for this rate. */
  supportsDropFrame: boolean;
  label: string;
}

export const FRAME_RATES: Record<FrameRateId, FrameRateInfo> = {
  '23.976': { id: '23.976', timebase: 24, fps: 24000 / 1001, supportsDropFrame: false, label: '23.976' },
  '24': { id: '24', timebase: 24, fps: 24, supportsDropFrame: false, label: '24' },
  '25': { id: '25', timebase: 25, fps: 25, supportsDropFrame: false, label: '25' },
  '29.97': { id: '29.97', timebase: 30, fps: 30000 / 1001, supportsDropFrame: true, label: '29.97' },
  '30': { id: '30', timebase: 30, fps: 30, supportsDropFrame: false, label: '30' },
};

export const FRAME_RATE_IDS: FrameRateId[] = ['23.976', '24', '25', '29.97', '30'];

/** Guards against 72.072 * 24000/1001 = 1727.9999999 style float error. */
const EPSILON = 1e-6;

export interface TimecodeParts {
  hours: number;
  minutes: number;
  seconds: number;
  frames: number;
}

function isDropFrame(rate: FrameRateId, dropFrame: boolean): boolean {
  return dropFrame && FRAME_RATES[rate].supportsDropFrame;
}

/** Real seconds → whole frame count (frame the playhead is currently inside). */
export function secondsToFrames(seconds: number, rate: FrameRateId): number {
  if (!Number.isFinite(seconds) || seconds <= 0) return 0;
  return Math.floor(seconds * FRAME_RATES[rate].fps + EPSILON);
}

/** Frame count → real seconds at the start of that frame. */
export function framesToSeconds(frames: number, rate: FrameRateId): number {
  return frames / FRAME_RATES[rate].fps;
}

/** 29.97 DF: frames dropped per minute, except every tenth minute. */
const DF_DROP = 2;
const DF_FRAMES_PER_10_MIN = 17982; // 10 * 60 * 30 - 9 * 2
const DF_FRAMES_PER_MIN = 1798; // 60 * 30 - 2

export function framesToParts(totalFrames: number, rate: FrameRateId, dropFrame = false): TimecodeParts {
  const timebase = FRAME_RATES[rate].timebase;
  let frames = Math.max(0, Math.floor(totalFrames));

  if (isDropFrame(rate, dropFrame)) {
    const tens = Math.floor(frames / DF_FRAMES_PER_10_MIN);
    const rem = frames % DF_FRAMES_PER_10_MIN;
    const adjust = rem < DF_DROP ? 0 : DF_DROP * Math.floor((rem - DF_DROP) / DF_FRAMES_PER_MIN);
    frames = frames + 9 * DF_DROP * tens + adjust;
  }

  const framesPerHour = timebase * 3600;
  const framesPerMinute = timebase * 60;
  const hours = Math.floor(frames / framesPerHour);
  frames %= framesPerHour;
  const minutes = Math.floor(frames / framesPerMinute);
  frames %= framesPerMinute;
  const seconds = Math.floor(frames / timebase);
  return { hours, minutes, seconds, frames: frames % timebase };
}

export function partsToFrames(parts: TimecodeParts, rate: FrameRateId, dropFrame = false): number {
  const timebase = FRAME_RATES[rate].timebase;
  const { hours, minutes, seconds, frames } = parts;
  let total = ((hours * 60 + minutes) * 60 + seconds) * timebase + frames;
  if (isDropFrame(rate, dropFrame)) {
    const totalMinutes = hours * 60 + minutes;
    total -= DF_DROP * (totalMinutes - Math.floor(totalMinutes / 10));
  }
  return total;
}

const pad2 = (n: number) => String(n).padStart(2, '0');

export function formatParts(parts: TimecodeParts, dropFrame = false): string {
  const sep = dropFrame ? ';' : ':';
  return `${pad2(parts.hours)}:${pad2(parts.minutes)}:${pad2(parts.seconds)}${sep}${pad2(parts.frames)}`;
}

/** Song position in seconds → "HH:MM:SS:FF" (or "HH:MM:SS;FF" for drop-frame). */
export function formatTimecode(seconds: number, rate: FrameRateId, dropFrame = false): string {
  const df = isDropFrame(rate, dropFrame);
  return formatParts(framesToParts(secondsToFrames(seconds, rate), rate, df), df);
}

/**
 * Slate display: "MM:SS:FF" without the hours field (bigger digits on camera).
 * Minutes keep counting past 59 rather than wrapping, so nothing is ever hidden.
 */
export function formatSlateTimecode(seconds: number, rate: FrameRateId, dropFrame = false): string {
  const df = isDropFrame(rate, dropFrame);
  const p = framesToParts(secondsToFrames(seconds, rate), rate, df);
  return `${pad2(p.hours * 60 + p.minutes)}:${pad2(p.seconds)}${df ? ';' : ':'}${pad2(p.frames)}`;
}

/**
 * Parses user input into song seconds. Accepts:
 *   HH:MM:SS:FF, HH:MM:SS;FF, HH:MM:SS, MM:SS, plain seconds ("72" or "72.5").
 * Returns null when the input is invalid (e.g. frames >= timebase, seconds >= 60).
 */
export function parseTimecode(input: string, rate: FrameRateId, dropFrame = false): number | null {
  const text = input.trim();
  if (text === '') return null;

  if (/^\d+(\.\d+)?$/.test(text)) {
    return Number(text);
  }

  const fields = text.split(/[:;.]/);
  if (fields.length < 2 || fields.length > 4) return null;
  if (!fields.every((f) => /^\d{1,3}$/.test(f))) return null;
  const nums = fields.map(Number);

  let parts: TimecodeParts;
  if (nums.length === 4) {
    parts = { hours: nums[0], minutes: nums[1], seconds: nums[2], frames: nums[3] };
  } else if (nums.length === 3) {
    parts = { hours: nums[0], minutes: nums[1], seconds: nums[2], frames: 0 };
  } else {
    parts = { hours: 0, minutes: nums[0], seconds: nums[1], frames: 0 };
  }

  const timebase = FRAME_RATES[rate].timebase;
  if (parts.minutes >= 60 || parts.seconds >= 60 || parts.frames >= timebase) return null;

  const df = isDropFrame(rate, dropFrame);
  if (df && parts.minutes % 10 !== 0 && parts.seconds === 0 && parts.frames < DF_DROP) {
    // Frames 00 and 01 don't exist at the top of non-tenth minutes in drop-frame.
    return null;
  }

  return framesToSeconds(partsToFrames(parts, rate, df), rate);
}

/** Human-friendly duration "M:SS.mmm" for logs. */
export function formatDuration(seconds: number): string {
  const safe = Math.max(0, seconds);
  const totalMs = Math.round(safe * 1000);
  const ms = totalMs % 1000;
  const totalSec = Math.floor(totalMs / 1000);
  const s = totalSec % 60;
  const m = Math.floor(totalSec / 60);
  return `${m}:${pad2(s)}.${String(ms).padStart(3, '0')}`;
}
