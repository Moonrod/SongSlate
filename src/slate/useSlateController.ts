import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';

import { audioEngine, type EngineEvent } from '../audio/SlateAudioEngine';
import { cueTimecodeBase } from '../domain/section';
import { FRAME_RATES, formatSlateTimecode } from '../domain/timecode';
import type { Cue, EndReason, LogEvent, LogEventType } from '../domain/types';
import { cueFileExists, cueFileUri } from '../services/audioFiles';
import { selectArmedCue, useAppStore } from '../state/store';
import { clearLoading, crashedWhileLoading, markLoading } from './loadGuard';

export type SlatePhase = 'empty' | 'loading' | 'armed' | 'countdown' | 'playing' | 'error';

export interface SlateView {
  phase: SlatePhase;
  /** Whole seconds left in the countdown (null when the countdown is 0 s). */
  countdown: number | null;
  /** Running song timecode while playing. */
  timecode: string;
  error: string | null;
}

interface RunningTake {
  takeNumber: number;
  cue: Cue;
  flipPerfMs: number;
  flipEpochMs: number;
  /** Position in the audio file at the flip. */
  offsetSeconds: number;
  /** Song-time offset of the file (a section's start in its original song; 0 otherwise). */
  tcBase: number;
  durationSeconds: number;
  outputLatencyMs: number;
  events: LogEvent[];
  flipped: boolean;
}

/** Flip when the target time is within half a display frame. */
const FLIP_TOLERANCE_MS = 8;

export function useSlateController() {
  const armedCue = useAppStore(selectArmedCue);
  const [view, setView] = useState<SlateView>({ phase: 'empty', countdown: null, timecode: '', error: null });
  const viewRef = useRef(view);
  const take = useRef<RunningTake | null>(null);
  const raf = useRef<number | null>(null);
  const starting = useRef(false);
  const [reloadToken, setReloadToken] = useState(0);
  /** Set when the user taps to retry a song that crashed the page last time. */
  const retryRequested = useRef(false);

  const update = useCallback((patch: Partial<SlateView>) => {
    const next = { ...viewRef.current, ...patch };
    const prev = viewRef.current;
    if (
      next.phase === prev.phase &&
      next.countdown === prev.countdown &&
      next.timecode === prev.timecode &&
      next.error === prev.error
    ) {
      return;
    }
    viewRef.current = next;
    setView(next);
  }, []);

  // ---- Preload the armed cue -------------------------------------------------
  const armedKey = armedCue ? `${armedCue.id}:${armedCue.storedFileName}` : null;
  useEffect(() => {
    if (take.current) return; // never swap the buffer mid-take
    if (!armedCue) {
      update({ phase: 'empty', error: null });
      return;
    }
    if (!cueFileExists(armedCue)) {
      update({ phase: 'error', error: 'Audio file is missing. Re-import this cue.' });
      return;
    }
    // Browser preview: if loading this song crashed the page last time, wait for a tap.
    if (crashedWhileLoading(armedCue.storedFileName) && !retryRequested.current) {
      update({
        phase: 'error',
        error: 'This song couldn’t be loaded last time. It may be too long for this viewer. Tap to try again.',
      });
      return;
    }
    retryRequested.current = false;
    let cancelled = false;
    update({ phase: 'loading', error: null });
    markLoading(armedCue.storedFileName);
    audioEngine
      .load(cueFileUri(armedCue), armedCue.originalFileName)
      .then(({ durationSeconds }) => {
        clearLoading();
        if (cancelled) return;
        const current = useAppStore.getState().cues.find((c) => c.id === armedCue.id);
        if (current && (current.durationSeconds == null || Math.abs(current.durationSeconds - durationSeconds) > 0.01)) {
          useAppStore.getState().updateCue(armedCue.id, { durationSeconds });
        }
        if (!take.current) update({ phase: 'armed', error: null });
      })
      .catch((e) => {
        clearLoading();
        if (cancelled) return;
        update({ phase: 'error', error: `Could not load audio: ${e?.message ?? String(e)}` });
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [armedKey, reloadToken]);

  // ---- Frame loop --------------------------------------------------------------
  const stopLoop = useCallback(() => {
    if (raf.current != null) cancelAnimationFrame(raf.current);
    raf.current = null;
  }, []);

  const loop = useRef<(() => void) | null>(null);
  const startLoop = useCallback(() => {
    if (raf.current != null) cancelAnimationFrame(raf.current);
    raf.current = requestAnimationFrame(() => loop.current?.());
  }, []);

  const tick = useCallback(() => {
    const t = take.current;
    if (!t) return;
    const { frameRate, dropFrame } = useAppStore.getState().settings;

    if (!t.flipped) {
      const remaining = t.flipPerfMs - performance.now();
      if (remaining <= FLIP_TOLERANCE_MS) {
        t.flipped = true;
        t.flipEpochMs = Date.now();
        update({
          phase: 'playing',
          countdown: null,
          timecode: formatSlateTimecode(t.tcBase + t.offsetSeconds, frameRate, dropFrame),
        });
      } else {
        const showCountdown = useAppStore.getState().settings.countdownSeconds > 0;
        update({ countdown: showCountdown ? Math.max(1, Math.ceil(remaining / 1000)) : null });
      }
    } else {
      const pos = audioEngine.getSongPosition();
      if (pos != null) {
        update({ timecode: formatSlateTimecode(t.tcBase + Math.max(t.offsetSeconds, pos), frameRate, dropFrame) });
      }
    }
    raf.current = requestAnimationFrame(() => loop.current?.());
  }, [update]);

  useEffect(() => {
    loop.current = tick;
  }, [tick]);

  // ---- Finishing a take ------------------------------------------------------
  const finish = useCallback(
    (reason: EndReason, stopSeconds: number | null) => {
      const t = take.current;
      if (!t) return;
      take.current = null;
      stopLoop();
      const store = useAppStore.getState();
      const { settings } = store;

      if (t.flipped) {
        const stopPos = Math.max(t.offsetSeconds, Math.min(stopSeconds ?? t.offsetSeconds, t.durationSeconds));
        store.recordTake({
          takeNumber: t.takeNumber,
          cueId: t.cue.id,
          cueName: t.cue.name,
          // For a section, the original song's file: that's what the editor has in the timeline.
          fileName: t.cue.section?.sourceFileName ?? t.cue.originalFileName,
          // Logged in song time: for a section, the original song's timecode.
          startMode: t.cue.section ? 'timecode' : t.cue.startMode,
          startSeconds: t.tcBase + t.offsetSeconds,
          stopSeconds: t.tcBase + stopPos,
          flipEpochMs: t.flipEpochMs,
          stopEpochMs: Date.now(),
          durationSeconds: stopPos - t.offsetSeconds,
          endReason: reason,
          frameRate: settings.frameRate,
          dropFrame: settings.dropFrame,
          latencyOffsetMs: settings.latencyOffsetMs,
          outputLatencyMs: t.outputLatencyMs,
          twoPop: settings.twoPop,
          sectionOf: t.cue.section?.sourceFileName,
          ...(t.cue.speed && t.cue.speed !== 1 ? { speed: t.cue.speed } : {}),
          events: t.events,
        });
      } else {
        // Cancelled during the countdown: nothing reached the camera, so it isn't a take.
        // Keep any events that happened, at session level.
        t.events.forEach((e) => store.logSessionEvent(e));
      }
      update({ phase: 'armed', countdown: null, timecode: '' });
    },
    [stopLoop, update],
  );

  // ---- Start / stop ------------------------------------------------------------
  const start = useCallback(async () => {
    const store = useAppStore.getState();
    const cue = selectArmedCue(store);
    if (!cue || take.current || starting.current || viewRef.current.phase !== 'armed') return;
    starting.current = true;
    const { settings } = store;
    const session = store.ensureActiveSession();
    const offsetSeconds = cue.startMode === 'timecode' ? cue.startSeconds : 0;
    try {
      const scheduled = await audioEngine.schedule({
        fileUri: cueFileUri(cue),
        fileName: cue.originalFileName,
        offsetSeconds,
        countdownSeconds: settings.countdownSeconds,
        latencyOffsetMs: settings.latencyOffsetMs,
        twoPop: settings.twoPop,
        popSeconds: 1 / FRAME_RATES[settings.frameRate].fps,
        playbackRate: cue.speed ?? 1,
        onEnded: (natural) => {
          if (natural && take.current) finish('ended', take.current.durationSeconds);
        },
      });
      take.current = {
        takeNumber: session.nextTake,
        cue,
        flipPerfMs: scheduled.flipPerfMs,
        flipEpochMs: 0,
        offsetSeconds: scheduled.offsetSeconds,
        tcBase: cueTimecodeBase(cue),
        durationSeconds: scheduled.durationSeconds,
        outputLatencyMs: scheduled.outputLatencyMs,
        events: [],
        flipped: false,
      };
      update({ phase: 'countdown', countdown: settings.countdownSeconds > 0 ? settings.countdownSeconds : null });
      startLoop();
    } catch (e: any) {
      update({ phase: 'error', error: `Could not start playback: ${e?.message ?? String(e)}` });
      useAppStore.getState().logSessionEvent({ at: Date.now(), type: 'audio-error', detail: e?.message ?? String(e) });
    } finally {
      starting.current = false;
    }
  }, [finish, startLoop, update]);

  const stop = useCallback(
    (reason: EndReason = 'stopped') => {
      if (!take.current) return;
      const pos = audioEngine.stop();
      finish(reason, pos);
    },
    [finish],
  );

  // ---- System events (interruptions, route changes, backgrounding) -------------
  const logEvent = useCallback((type: LogEventType, detail?: string) => {
    const event: LogEvent = { at: Date.now(), type, detail };
    const t = take.current;
    if (t) {
      event.takeNumber = t.takeNumber;
      t.events.push(event);
    } else {
      useAppStore.getState().logSessionEvent(event);
    }
  }, []);

  useEffect(() => {
    const unsubscribe = audioEngine.subscribe((e: EngineEvent) => {
      if (e.type === 'interruption') {
        logEvent(e.phase === 'began' ? 'interruption-began' : 'interruption-ended');
        if (e.phase === 'began' && take.current) stop('interrupted');
      } else if (e.type === 'routeChange') {
        if (e.reason === 'OldDeviceUnavailable') logEvent('output-disconnected');
        else if (e.reason === 'NewDeviceAvailable') logEvent('output-connected');
      } else if (e.type === 'error') {
        logEvent('audio-error', e.message);
        if (take.current) stop('error');
      }
    });

    let wasBackground = false;
    const appStateSub = AppState.addEventListener('change', (state) => {
      if (state === 'background') {
        wasBackground = true;
        logEvent('app-background', take.current ? 'during a take' : undefined);
        void audioEngine.sleep();
      } else if (state === 'active') {
        if (wasBackground) logEvent('app-foreground');
        wasBackground = false;
        void audioEngine.wake();
      }
    });

    return () => {
      unsubscribe();
      appStateSub.remove();
    };
  }, [logEvent, stop]);

  useEffect(() => () => stopLoop(), [stopLoop]);

  // ---- Gesture handlers ----------------------------------------------------------
  const onTap = useCallback(() => {
    const phase = viewRef.current.phase;
    const { stopGesture } = useAppStore.getState().settings;
    if (phase === 'armed') void start();
    else if (phase === 'error') {
      retryRequested.current = true;
      setReloadToken((n) => n + 1);
    }
    else if ((phase === 'countdown' || phase === 'playing') && stopGesture === 'tap') stop('stopped');
  }, [start, stop]);

  const onLongPress = useCallback(() => {
    const phase = viewRef.current.phase;
    if (phase === 'countdown' || phase === 'playing') stop('stopped');
  }, [stop]);

  const canNavigate = view.phase !== 'countdown' && view.phase !== 'playing';

  return { view, armedCue, onTap, onLongPress, canNavigate };
}
