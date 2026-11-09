import type { DotId } from './dots';
import type { CueSpeed } from './speed';

export type FrameRateId = '23.976' | '24' | '25' | '29.97' | '30';

export type StartMode = 'full' | 'timecode';

export interface Cue {
  id: string;
  /** Display title (defaults to the file name without extension). */
  name: string;
  /** Name of the copied file inside the app's document/audio directory. */
  storedFileName: string;
  /** Original file name as picked from the Files app. */
  originalFileName: string;
  /** Duration in seconds, once known. */
  durationSeconds: number | null;
  startMode: StartMode;
  /** Start point in seconds of song time. Only used when startMode === 'timecode'. */
  startSeconds: number;
  /**
   * Set when this cue's file was cut from another song. Its audio starts at
   * `startSeconds` of the original, and the slate shows the original song's
   * timecode so takes still line up with the full song in the edit.
   */
  section?: CueSection;
  /** Coloured-dot emoji shown before the title on the slate. */
  dot?: DotId;
  /** Playback speed chosen when the section was cut (2 = 2x F, 0.5 = 2x S). */
  speed?: CueSpeed;
}

export interface CueSection {
  sourceCueId: string;
  sourceName: string;
  sourceFileName: string;
  /** The file's start/end in the original song (seconds), buffer included. */
  startSeconds: number;
  endSeconds: number;
  /** Pre-roll and run-out actually included around the chosen section (seconds). */
  bufferBefore?: number;
  bufferAfter?: number;
}

export type StopGesture = 'tap' | 'longPress';
export type OrientationSetting = 'portrait' | 'landscape';

export interface Settings {
  countdownSeconds: number; // 0..10
  frameRate: FrameRateId;
  /** Only meaningful for 29.97. */
  dropFrame: boolean;
  stopGesture: StopGesture;
  twoPop: boolean;
  /**
   * Positive = the green flip is delayed relative to the audio.
   * Increase this if the audio is heard AFTER the screen turns green.
   */
  latencyOffsetMs: number;
  orientation: OrientationSetting;
}

export type EndReason = 'stopped' | 'ended' | 'interrupted' | 'error';

export type LogEventType =
  | 'interruption-began'
  | 'interruption-ended'
  | 'output-disconnected'
  | 'output-connected'
  | 'route-change'
  | 'app-background'
  | 'app-foreground'
  | 'audio-error';

export interface LogEvent {
  /** Epoch milliseconds. */
  at: number;
  type: LogEventType;
  detail?: string;
  /** Take number the event happened during, if any. */
  takeNumber?: number;
}

export interface TakeLog {
  id: string;
  takeNumber: number;
  cueId: string;
  cueName: string;
  fileName: string;
  startMode: StartMode;
  /** Song position (seconds) at the green flip. */
  startSeconds: number;
  /** Song position (seconds) when playback stopped. */
  stopSeconds: number;
  /** Epoch ms of the red→green flip (the sync point). */
  flipEpochMs: number;
  /** Epoch ms when playback stopped. */
  stopEpochMs: number;
  durationSeconds: number;
  endReason: EndReason;
  /** Settings snapshot, so the report is self-describing even if settings change later. */
  frameRate: FrameRateId;
  dropFrame: boolean;
  latencyOffsetMs: number;
  /** Measured output latency the engine compensated for (ms). */
  outputLatencyMs: number;
  twoPop: boolean;
  /** Original song file, when the cue was a section cut from it. */
  sectionOf?: string;
  /** Playback speed of the take, when not normal (2 or 0.5). */
  speed?: number;
  events: LogEvent[];
}

export interface Session {
  id: string;
  name: string;
  createdAt: number;
  nextTake: number;
  takes: TakeLog[];
  /** Events that happened while no take was running. */
  events: LogEvent[];
}
