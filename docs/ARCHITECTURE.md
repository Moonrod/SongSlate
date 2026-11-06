# SyncSlate architecture

## Stack choice

**React Native + Expo (SDK 58, TypeScript)**, with **`react-native-audio-api`** (Software Mansion's
Web Audio API implementation) as the audio engine.

Why not Flutter: nothing in the brief needs Flutter, and the Expo modules cover every device
requirement (keep-awake, brightness, orientation lock, document picker, print-to-PDF, share sheet)
with first-party, maintained packages.

Why `react-native-audio-api` instead of `expo-audio` / a regular media player: audio start timing
is the core requirement. A media player's `play()` starts "soon": the delay depends on decoder
warm-up, buffering and thread scheduling, and it changes from take to take. Web Audio gives
**sample-accurate scheduling against the hardware audio clock**:

```
source.start(when /* AudioContext time */, offset /* song seconds */)
```

So the audio can be queued *before* the flip, to start at an exact moment in the future. The
trade-off: it is a native module, so the app runs in a **development build**, not Expo Go.

## Timing model (the sync point)

```
 tap                                countdown (N s)                          flip
  │──────────────────────────────────────────────────────────────────────────▶│
  │ schedule: audioStartCtx = ctx.currentTime + lead                         │
  │           source.start(audioStartCtx, offset)   ← sample-accurate        │
  │           flipCtx = audioStartCtx + outputLatency + latencyOffset        │
  │ rAF loop: show ceil(remaining)… when |flip − now| < ½ frame → GREEN      │
```

1. **Preload.** When a cue is armed (on launch, on swipe/next/prev, or from the cue list), the
   whole file is decoded to PCM in memory. Nothing is read from disk or decoded at the flip.
2. **Hot output.** The `AudioContext` stays running (outputting silence) while the app is in the
   foreground, so the output hardware is already running. It is suspended only when the app is
   backgrounded with no take running.
3. **Schedule at tap.** The buffer source is scheduled for the end of the countdown on the audio
   clock. A minimum lead of 350 ms (plus any negative latency offset) applies when the countdown
   is 0, so the source is always queued before its start time.
4. **Flip.** The audio-clock flip time is converted to the JS `performance.now()` clock, and a
   `requestAnimationFrame` loop flips to green within ½ display frame of it.
   `outputLatency` (reported by the OS) is compensated automatically. What remains
   (display pipeline, Bluetooth, etc.) is constant per device, and the **latency offset**
   setting calibrates it out.
5. **Timecode.** The running counter is `offset + (ctx.currentTime − flipCtx)`, interpolated
   between audio-clock ticks. It reads the start timecode exactly at the green flip and follows
   the audio clock (not a JS timer), so it doesn't drift from the music.
6. **2-pop.** An optional 1 kHz, one-frame beep is scheduled on the same audio clock at the same
   instant as the music start. It is an audio reference with the same timing as the visual flip,
   and it is also the calibration tool.

## Modules

```
src/
  app/                       expo-router screens
    _layout.tsx              stack, keep-awake, orientation lock, audio init, store hydration
    index.tsx                THE SLATE (red/green full screen)
    cues.tsx                 cue list: import, reorder, arm
    cue/[id].tsx             edit cue: rename, FULL SONG vs start TC, delete
    report.tsx               session log, sessions, CSV/PDF export
    settings.tsx             countdown, frame rate, DF, stop gesture, 2-pop, latency, orientation
  audio/
    SlateAudioEngine.ts      AudioContext, decode cache, scheduling, position, interruptions
    aiff.ts                  pure-TS AIFF/AIFC decoder (Android has no native AIFF decoder)
  slate/
    useSlateController.ts    slate state machine: empty/loading/armed/countdown/playing/error
  domain/                    pure, unit-tested logic
    timecode.ts              HH:MM:SS:FF math, 23.976/24/25/29.97(DF)/30
    report.ts                take → row, CSV and HTML (for PDF) generation
    types.ts
  services/
    audioFiles.ts            document picker import, copy into app storage
    exportReport.ts          CSV file / PDF (expo-print) → native share sheet
    device.ts                brightness boost/restore, orientation lock
  state/store.ts             zustand store persisted to AsyncStorage
  ui/                        SlateSurface (tap/long-press/swipe), controls, theme
```

## Slate state machine

```
empty ──(cue imported)──▶ loading ──(decoded)──▶ armed ──tap──▶ countdown ──(flip)──▶ playing
  ▲                          │                    ▲  ▲              │                    │
  │                     (error)──tap retry──┘     │  └──tap/long-press (cancel, not logged)
  │                                               └── tap/long-press stop │ song ends │ interruption
  └───────────────────(last cue deleted)                  → take logged, take number +1
```

## Sections

`src/app/section.tsx` → `services/sections.ts`: the source song is decoded to PCM, the frames between
the typed start and end are copied out, encoded as 16-bit WAV (`audio/wav.ts`) and saved as a new file.
The new cue keeps a `section` record (source, start, end). Its file starts at 0, but every timecode
shown or logged adds `section.startSeconds` (`cueTimecodeBase`), so the counter and the report read
the original song's timecode. The section start is stored exactly as typed rather than snapped to a
sample, which could otherwise round to the previous frame.

## Data & persistence

- Everything (settings, cues, sessions, takes) lives in one zustand store persisted to
  AsyncStorage on every change. A take is written the moment it ends.
- Imported audio is copied into `<Documents>/audio/<cueId>.<ext>`. The store keeps only the
  **file name**, because the iOS app-container path changes across updates.
- Timecode start points are stored as **seconds of song time**, so changing the frame rate
  re-expresses the same musical moment instead of moving it.
- Each `TakeLog` snapshots frame rate, drop-frame, latency offset and measured output latency, so
  an exported report describes itself even if settings change later.

## Reliability features

| Requirement | Implementation |
| --- | --- |
| Screen awake | `useKeepAwake()` in the root layout (whole app) |
| Max brightness on slate | `expo-brightness` on slate focus; restored on blur/background (Android: hand back to system) |
| Ignore iOS silent switch | `AVAudioSession` category `playback` via `AudioManager.setSystemOptions` |
| Phone call / Siri / other app | `interruption` event → take stopped as **Interrupted**, logged |
| Headphones unplugged | `routeChange: OldDeviceUnavailable` → logged on the take/session; playback continues |
| App backgrounded | logged; idle audio output is suspended to save battery |
| Orientation | `expo-screen-orientation` lock from settings (`requireFullScreen` on iPad) |
| Device latency | `outputLatency` auto-compensation + manual latency offset (±500 ms) |
