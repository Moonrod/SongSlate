# SyncSlate

A playback slate for music video and social content shoots. Performers lip-sync to the track
while the phone or tablet is held up to camera. The screen is **red** while armed and flips to
**green** at the exact moment the audio starts, so the editor can line up sync in post. It shows a
running song timecode (HH:MM:SS:FF) that can be read on camera, and it logs every take to a report
you can export as CSV or PDF.

- React Native + Expo SDK 58 (TypeScript), expo-router
- Audio: [`react-native-audio-api`](https://docs.swmansion.com/react-native-audio-api/) (Web Audio).
  Playback is scheduled sample-accurately on the hardware audio clock.
- Architecture and timing model: [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md)

## Using the app

| Where | What |
| --- | --- |
| **Slate** (home) | Tap anywhere: countdown → GREEN + audio + running timecode. Tap (or long-press, per settings) to stop. Swipe left/right or use ◀ PREV / NEXT ▶ to change cues. The CUES / REPORT / SETTINGS buttons are hidden while a take is running. |
| **Cues** | `+ Import` audio (MP3, WAV, AIFF, M4A) from Files. ▲▼ reorder, ARM selects the slate cue, tap a cue to rename it, set FULL SONG or a start timecode, or delete it. |
| **Report** | The active session's takes in order. Rename the session inline, start a new session, switch between sessions, or long-press a session to delete it. Export CSV / PDF through the share sheet. |
| **Settings** | Countdown 0–10 s, stop gesture, 2-pop, orientation, frame rate (23.976/24/25/29.97/30, plus 29.97 drop-frame), latency offset, take counter. |

Every take logs: take number, cue and file name, start point, wall-clock time of the green flip
(ms), song timecode at start and stop, duration, how it ended (stopped / played to end /
interrupted / error), and any interruptions, output changes or backgrounding during the take.

## Setup

Requirements: Node 20+ (tested with 22), and for local native builds Xcode 16+ (macOS) and/or
Android Studio with an SDK and emulator.

```bash
npm install
```

The app uses native modules that are **not in Expo Go**, so it runs in a development build.

### iOS simulator (macOS)

```bash
npm run ios
```

(`expo run:ios`: generates `ios/`, installs pods, builds, launches the simulator, starts Metro.)

### Android emulator

Start an emulator from Android Studio's Device Manager first, then:

```bash
npm run android
```

After the first native build, you can iterate on JS with just:

```bash
npm start
```

### Physical device

**iOS (USB, free Apple ID is fine for development):**

1. Plug in the iPhone/iPad and trust the computer. On iOS 16+, enable Settings → Privacy &
   Security → Developer Mode.
2. Run:

```bash
npx expo run:ios --device
```

3. Pick the device. If signing fails, open `ios/SyncSlate.xcworkspace` in Xcode, pick your team
   under Signing & Capabilities, and run again.

**Android (USB):**

1. Enable Developer options → USB debugging.
2. Run:

```bash
npx expo run:android --device
```

**No Mac / build in the cloud:** build a development client with EAS and install it from the link
it gives you:

```bash
npx eas-cli@latest build --profile development --platform ios
```

```bash
npx eas-cli@latest build --profile development --platform android
```

Then `npm start` and open the project from the dev client. For iOS internal devices, register
them first with `npx eas-cli@latest device:create`.

> Native config lives in `app.json` (Continuous Native Generation). `ios/` and `android/` are
> generated and git-ignored. Run `npm run prebuild` to regenerate them after changing plugins.

## Release builds

One-time setup:

```bash
npm install -g eas-cli
```

```bash
eas login
```

```bash
eas init
```

`eas init` links the project and writes the EAS project ID into `app.json`. Change
`ios.bundleIdentifier` / `android.package` (currently `com.syncslate.app`) to identifiers you own
**before** the first store build.

### TestFlight (iOS)

```bash
eas build --platform ios --profile production
```

```bash
eas submit --platform ios --latest
```

EAS handles certificates and provisioning profiles (it asks for your Apple ID the first time).
`submit` uploads to App Store Connect. The build appears in TestFlight after Apple's processing
(usually 5–30 min). Add internal testers in App Store Connect → TestFlight.

### Android internal testing (Google Play)

1. Create the app in Google Play Console. The very first AAB must be uploaded **manually**:
   build it, then upload it under Testing → Internal testing → Create release.

```bash
eas build --platform android --profile production
```

2. Create a Google service account key with Play Console access and reference it in `eas.json`
   (`submit.production.android.serviceAccountKeyPath`). Later builds can then be submitted
   directly to the internal track (configured in `eas.json`):

```bash
eas submit --platform android --latest
```

For quick side-loading without Play, the `preview` profile builds an installable APK:

```bash
eas build --platform android --profile preview
```

## Tests & checks

```bash
npm test
```

```bash
npm run typecheck
```

```bash
npm run lint
```

```bash
npm run doctor
```

Unit tests cover the timecode math (all five rates, drop-frame counting, parse/format round trips,
NTSC real-time behaviour), the report export (CSV quoting and formula injection, HTML escaping,
row content), and the AIFF decoder.

## Calibrating sync on a new device

1. Settings → turn on **2-pop**, set the frame rate to your project's.
2. Film the slate with the camera's own audio (or record it to your NLE), and do a take.
3. In the editor, find the first green frame and the start of the beep.
   - Beep **after** the green frame → increase **Latency offset** by the difference.
   - Beep **before** the green frame → decrease it.
   - 1 frame ≈ 41.7 ms at 23.976/24, 40 ms at 25, 33.4 ms at 29.97/30.
4. Repeat until they land on the same frame. The offset is saved, and each take's report row
   records the offset that was in use.

Calibrate per device **and per output route**: Bluetooth speakers add 100–300 ms. Wired output or
the built-in speaker is strongly recommended for playback on set.

## Notes & limits

- The whole song is decoded into memory when a cue is armed (~10 MB per stereo minute at
  44.1/48 kHz). A 10-minute track is ~100 MB, which is fine on current phones and tablets.
- AIFF is decoded natively on iOS. On Android it goes through the built-in JS decoder (PCM and
  `sowt`/`fl32` AIFF-C; compressed AIFF-C such as `ima4` is not supported).
- Headphones unplugged mid-take: the event is logged and playback continues on the speaker
  (stopping would ruin the take). A phone call or other interruption stops the take and marks it
  **Interrupted**.
- Interruptions are logged against the running take, or at session level otherwise. Both
  appear in the report and the PDF.
