import { File } from 'expo-file-system';
import { Platform } from 'react-native';
import {
  AudioBuffer,
  AudioBufferSourceNode,
  AudioContext,
  AudioManager,
  GainNode,
  OscillatorNode,
} from 'react-native-audio-api';

import { decodeAiff, isAiffFileName } from './aiff';

/**
 * SyncSlate audio engine.
 *
 * Timing model
 * ------------
 * All scheduling happens on the AudioContext's hardware clock (`ctx.currentTime`),
 * not on JS timers:
 *
 *   1. When a cue is armed, the whole file is decoded into PCM (`load`). Nothing
 *      has to be read from disk or decoded at the moment of the flip.
 *   2. The AudioContext is kept running (outputting silence) while the app is in
 *      the foreground, so the output device is already "hot" — there's no
 *      device spin-up latency at the start of a take.
 *   3. When a take starts, the buffer source is scheduled with
 *      `source.start(audioStartCtx, offset)` — sample-accurate, at a context
 *      time that coincides with the end of the countdown.
 *   4. The UI flips to green when the *audible* start is due:
 *        flipCtx = audioStartCtx + outputLatency + userLatencyOffset
 *      converted to the JS `performance.now()` clock, and polled from
 *      requestAnimationFrame. JS/display latency that remains is constant per
 *      device and is what the user's latency-offset setting calibrates out.
 */

export type EngineEvent =
  | { type: 'interruption'; phase: 'began' | 'ended'; shouldResume: boolean }
  | { type: 'routeChange'; reason: string }
  | { type: 'error'; message: string };

export interface LoadedTrack {
  key: string;
  durationSeconds: number;
}

export interface ScheduleOptions {
  fileUri: string;
  fileName: string;
  /** Song position to start from (seconds). */
  offsetSeconds: number;
  /** Requested countdown before the flip (seconds). */
  countdownSeconds: number;
  latencyOffsetMs: number;
  twoPop: boolean;
  /** Length of the 2-pop beep, normally one video frame. */
  popSeconds: number;
  /** Called when the source finishes. `natural` = played to the end of the file. */
  onEnded: (natural: boolean) => void;
}

export interface ScheduledTake {
  /** performance.now() timestamp at which the screen should turn green. */
  flipPerfMs: number;
  /** Song position at the flip. */
  offsetSeconds: number;
  /** Output latency the engine compensated for (ms). */
  outputLatencyMs: number;
  durationSeconds: number;
}

/** Shortest scheduling lead, so the source is safely queued before its start time. */
const MIN_LEAD_SECONDS = 0.35;
const MAX_SANE_OUTPUT_LATENCY = 0.5;

interface ActiveTake {
  source: AudioBufferSourceNode;
  pop: { osc: OscillatorNode; gain: GainNode } | null;
  flipCtx: number;
  offsetSeconds: number;
  durationSeconds: number;
  stopRequested: boolean;
  finished: boolean;
}

class SlateAudioEngine {
  private ctx: AudioContext | null = null;
  private initPromise: Promise<void> | null = null;
  private track: { key: string; buffer: AudioBuffer } | null = null;
  private loading: { key: string; promise: Promise<AudioBuffer> } | null = null;
  private active: ActiveTake | null = null;
  private listeners = new Set<(e: EngineEvent) => void>();
  private subscriptions: { remove: () => void }[] = [];

  /** Smooths the steppy (render-quantum granularity) audio clock for display. */
  private clockAnchor = { ctxTime: -1, perfMs: 0 };

  init(): Promise<void> {
    if (!this.initPromise) {
      this.initPromise = this.doInit().catch((err) => {
        this.initPromise = null;
        throw err;
      });
    }
    return this.initPromise;
  }

  private async doInit() {
    // iOS: 'playback' category plays through the silent switch and isn't mixed
    // with or ducked by other apps. Android ignores the iOS block.
    AudioManager.setSystemOptions({
      ios: { category: 'playback', mode: 'default', options: [] },
    });
    try {
      await AudioManager.setAudioSessionActivity(true);
    } catch (e) {
      this.emit({ type: 'error', message: `Could not activate audio session: ${String(e)}` });
    }
    AudioManager.observeAudioInterruptions(true);

    this.subscriptions.push(
      AudioManager.addSystemEventListener('interruption', (e) => {
        this.emit({ type: 'interruption', phase: e.type, shouldResume: e.shouldResume });
        if (e.type === 'ended') {
          void this.wake();
        }
      }),
      AudioManager.addSystemEventListener('routeChange', (e) => {
        this.emit({ type: 'routeChange', reason: e.reason });
      }),
    );

    this.ctx = new AudioContext({ latencyHint: 'interactive' });
    this.ctx.onerror = () => this.emit({ type: 'error', message: 'Audio context error' });
    await this.wake();
  }

  subscribe(listener: (e: EngineEvent) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private emit(e: EngineEvent) {
    this.listeners.forEach((l) => l(e));
  }

  private requireCtx(): AudioContext {
    if (!this.ctx) throw new Error('Audio engine not initialised');
    return this.ctx;
  }

  /** Resume the context (and session) so the output is running and its clock advances. */
  async wake(): Promise<void> {
    const ctx = this.ctx;
    if (!ctx) return;
    try {
      if (Platform.OS === 'ios') await AudioManager.setAudioSessionActivity(true);
    } catch {
      // Reported via interruption events; nothing else to do here.
    }
    if (ctx.state !== 'running') {
      await ctx.resume();
    }
    await this.waitForClock();
  }

  /** Put the output to sleep while backgrounded and idle (saves battery). */
  async sleep(): Promise<void> {
    if (this.active || !this.ctx || this.ctx.state !== 'running') return;
    try {
      await this.ctx.suspend();
    } catch {
      // ignore
    }
  }

  /** Wait until the audio clock is demonstrably advancing (device is outputting). */
  private async waitForClock(timeoutMs = 800): Promise<void> {
    const ctx = this.requireCtx();
    const t0 = ctx.currentTime;
    const started = Date.now();
    while (ctx.currentTime === t0 && Date.now() - started < timeoutMs) {
      await new Promise((r) => setTimeout(r, 10));
    }
  }

  get isPlaying(): boolean {
    return this.active !== null && !this.active.finished;
  }

  get loadedKey(): string | null {
    return this.track?.key ?? null;
  }

  /** Decode a file into memory. Re-uses the cached buffer when the same file is armed again. */
  async load(fileUri: string, fileName: string): Promise<LoadedTrack> {
    await this.init();
    const key = fileUri;
    if (this.track?.key === key) {
      return { key, durationSeconds: this.track.buffer.duration };
    }
    if (this.loading?.key !== key) {
      this.loading = { key, promise: this.decode(fileUri, fileName) };
    }
    const promise = this.loading.promise;
    try {
      const buffer = await promise;
      // A newer load may have started while we were decoding; only the latest wins the cache.
      if (this.loading?.key === key) {
        this.track = { key, buffer };
        this.loading = null;
      }
      return { key, durationSeconds: buffer.duration };
    } catch (e) {
      if (this.loading?.key === key) this.loading = null;
      throw e;
    }
  }

  private async decode(fileUri: string, fileName: string): Promise<AudioBuffer> {
    const ctx = this.requireCtx();
    try {
      return await ctx.decodeAudioData(fileUri);
    } catch (nativeError) {
      if (!isAiffFileName(fileName)) throw nativeError;
      // Android has no native AIFF decoder: decode it in JS.
      const bytes = await new File(fileUri).bytes();
      const pcm = decodeAiff(bytes);
      const buffer = ctx.createBuffer(pcm.channels.length, pcm.frameCount, pcm.sampleRate);
      pcm.channels.forEach((data, ch) => buffer.copyToChannel(data, ch));
      return buffer;
    }
  }

  /**
   * Schedule playback so that the audible start (song position `offsetSeconds`)
   * coincides with the end of the countdown. Returns the flip time on the
   * performance.now() clock.
   */
  async schedule(opts: ScheduleOptions): Promise<ScheduledTake> {
    await this.init();
    const ctx = this.requireCtx();
    if (this.active && !this.active.finished) {
      throw new Error('A take is already running');
    }

    await this.load(opts.fileUri, opts.fileName);
    const buffer = this.track!.buffer;
    if (opts.offsetSeconds >= buffer.duration) {
      throw new Error('Start point is beyond the end of the song');
    }

    if (ctx.state !== 'running') await this.wake();

    const rawLatency = ctx.outputLatency;
    const outputLatency =
      Number.isFinite(rawLatency) && rawLatency > 0 && rawLatency < MAX_SANE_OUTPUT_LATENCY ? rawLatency : 0;
    const userOffset = opts.latencyOffsetMs / 1000;

    // Lead time must leave room for a negative user offset (flip before audio is queued).
    const lead = Math.max(opts.countdownSeconds, MIN_LEAD_SECONDS + Math.max(0, -userOffset));

    const ctxNow = ctx.currentTime;
    const perfNow = performance.now();
    const audioStartCtx = ctxNow + lead;
    const flipCtx = audioStartCtx + outputLatency + userOffset;

    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.connect(ctx.destination);

    let pop: ActiveTake['pop'] = null;
    if (opts.twoPop) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = 1000;
      gain.gain.value = 0.5; // ≈ -6 dBFS
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(audioStartCtx);
      osc.stop(audioStartCtx + opts.popSeconds);
      pop = { osc, gain };
    }

    const take: ActiveTake = {
      source,
      pop,
      flipCtx,
      offsetSeconds: opts.offsetSeconds,
      durationSeconds: buffer.duration,
      stopRequested: false,
      finished: false,
    };
    this.active = take;

    source.onended = () => {
      if (take.finished) return;
      take.finished = true;
      this.cleanup(take);
      if (this.active === take) this.active = null;
      opts.onEnded(!take.stopRequested);
    };

    source.start(audioStartCtx, opts.offsetSeconds);

    this.clockAnchor = { ctxTime: ctxNow, perfMs: perfNow };
    return {
      flipPerfMs: perfNow + (flipCtx - ctxNow) * 1000,
      offsetSeconds: opts.offsetSeconds,
      outputLatencyMs: Math.round(outputLatency * 1000),
      durationSeconds: buffer.duration,
    };
  }

  /**
   * Current song position (seconds) as it should be displayed: equals the start
   * point exactly at the green flip. Interpolated between audio-clock ticks.
   */
  getSongPosition(): number | null {
    const take = this.active;
    if (!take || !this.ctx) return null;
    const pos = take.offsetSeconds + (this.smoothedCtxTime() - take.flipCtx);
    return Math.min(pos, take.durationSeconds);
  }

  private smoothedCtxTime(): number {
    const ctx = this.ctx!;
    const t = ctx.currentTime;
    const now = performance.now();
    if (t !== this.clockAnchor.ctxTime) {
      this.clockAnchor = { ctxTime: t, perfMs: now };
      return t;
    }
    // Clock hasn't ticked since last read: extrapolate, but never by more than 100 ms.
    return t + Math.min(0.1, (now - this.clockAnchor.perfMs) / 1000);
  }

  /** Stop the running take. Returns the song position at the stop, or null if nothing was running. */
  stop(): number | null {
    const take = this.active;
    if (!take || take.finished) return null;
    const position = this.getSongPosition();
    take.stopRequested = true;
    try {
      take.source.stop();
    } catch {
      // Already stopped.
    }
    try {
      take.pop?.osc.stop();
    } catch {
      // Already stopped.
    }
    // onended will fire asynchronously; make state consistent immediately too.
    take.finished = true;
    this.cleanup(take);
    this.active = null;
    return position;
  }

  private cleanup(take: ActiveTake) {
    try {
      take.source.onended = null;
      take.source.disconnect();
      take.pop?.osc.disconnect();
      take.pop?.gain.disconnect();
    } catch {
      // ignore
    }
  }
}

export const audioEngine = new SlateAudioEngine();
