import { router, useRootNavigationState } from 'expo-router';
import { useEffect, useState, type ReactNode } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useAppStore } from '../state/store';
import { colors } from '../ui/theme';

type Route = '/' | '/cues' | '/report' | '/settings';

interface Step {
  route: Route;
  label: string;
  title: string;
  points: string[];
  extra?: ReactNode;
}

/** A small copy of the new-day message, shown inside the tour. */
function NewDayMock() {
  return (
    <View style={styles.mock} accessibilityLabel="Example of the new day message">
      <Text style={styles.mockTitle}>Is this a new shoot?</Text>
      <View style={styles.mockButtons}>
        <View style={[styles.mockBtn, styles.mockNo]}>
          <Text style={styles.mockBtnText}>No</Text>
        </View>
        <View style={[styles.mockBtn, styles.mockYes]}>
          <Text style={styles.mockBtnText}>Yes</Text>
        </View>
      </View>
    </View>
  );
}

const STEPS: Step[] = [
  {
    route: '/cues',
    label: 'Cues',
    title: 'Your cue list',
    points: [
      'Tap + Import to add songs (MP3, WAV, AIFF or M4A) from the Files app. Each song becomes a cue.',
      'Every cue gets its own marker: 8 coloured dots, then 8 squares, so the list holds 16 cues.',
      'Tap a cue to rename it, change its marker or start it from a timecode. ARM puts it on the slate; ▲ ▼ reorder.',
      'Tap Select to tick cues, or all of them, and delete them together.',
    ],
  },
  {
    route: '/cues',
    label: 'Snippets',
    title: 'Timecode snippets',
    points: [
      'Cut part of a song into its own cue: ✂︎ New section from a song here, or ✂︎ CUT A SECTION inside a cue.',
      'Drag along the song bar to set the start and nudge it by seconds or frames. Then tap a length (:15, :30, :45, 1:00) or Custom.',
      '+5s buffer adds pre-roll and run-out. 2x F or 2x S plays it twice as fast or at half speed.',
      'It’s named automatically, TC 01 (1:20), TC 02 …, with its start time. The slate keeps the original song’s timecode.',
    ],
  },
  {
    route: '/',
    label: 'Slate',
    title: 'Syncing on the slate',
    points: [
      'Hold the phone up to camera. Red means armed: it shows the cue, where it starts and the take number.',
      'Tap anywhere to start. After the countdown the screen flips to green as the audio starts. That flip is your sync point in the edit.',
      'The big timecode is the song’s position. Tap again to stop (or long-press, set in Settings) and the take number goes up.',
      'Swipe left or right, or use PREV and NEXT, to change cues. The buttons hide during a take.',
    ],
  },
  {
    route: '/report',
    label: 'Report',
    title: 'The report',
    points: [
      'Every take is logged: the green-flip time to the millisecond, start and stop timecode, length and how it ended.',
      'At the end of the shoot, tap Export CSV or Export PDF and send it with the share sheet (email, AirDrop, Files).',
      'Each shoot day is its own session. Rename it here, or open earlier ones under All sessions.',
    ],
  },
  {
    route: '/',
    label: 'New day',
    title: 'Each new day',
    points: [
      'The first time you open the app on a new day, this message flashes up.',
      'Yes clears the cue list and starts a new session from take 1. Earlier reports stay.',
      'No keeps everything, for a shoot that runs over more than one day.',
    ],
    extra: <NewDayMock />,
  },
  {
    route: '/settings',
    label: 'Settings',
    title: 'Settings',
    points: [
      'Countdown: how many seconds before the green flip (0–10).',
      'Stop playback with: tap, or long-press to avoid stopping by accident.',
      '2-pop beep: a one-frame beep at the flip, so the sync point can be heard too.',
      'Orientation, frame rate (23.976 to 30) and drop-frame for the timecode.',
      'Latency offset: fine-tunes the flip against the audio on this phone. You can replay this tour from the bottom of Settings.',
    ],
  },
];

function goTo(route: Route) {
  if (router.canDismiss()) router.dismissAll();
  if (route !== '/') router.push(route);
}

function TourCard() {
  const [step, setStep] = useState(0);
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  const s = STEPS[step];
  const last = step === STEPS.length - 1;
  // Navigating before the navigator has mounted throws, so wait for it.
  const navReady = !!useRootNavigationState()?.key;

  useEffect(() => {
    if (navReady) goTo(STEPS[step].route);
  }, [step, navReady]);

  const finish = () => {
    useAppStore.getState().setTourDone(true);
    goTo('/');
  };

  return (
    // The dimmed backdrop keeps the screen visible but not tappable during the tour.
    <View style={styles.backdrop} accessibilityViewIsModal>
      <View
        style={[styles.card, { paddingBottom: 16 + insets.bottom, maxHeight: height * 0.62 }]}
        accessibilityRole="summary"
      >
        <View style={styles.topRow}>
          <Text style={styles.eyebrow}>{`${step + 1} of ${STEPS.length} · ${s.label}`}</Text>
          {!last ? (
            <Pressable onPress={finish} hitSlop={10} accessibilityRole="button" accessibilityLabel="Skip the tour">
              <Text style={styles.skip}>Skip tour</Text>
            </Pressable>
          ) : null}
        </View>
        <View style={styles.progress}>
          {STEPS.map((_, i) => (
            <View key={i} style={[styles.dot, i <= step && styles.dotOn]} />
          ))}
        </View>
        <Text style={styles.title} accessibilityRole="header">
          {s.title}
        </Text>
        <ScrollView style={{ flexGrow: 0 }} contentContainerStyle={{ gap: 8 }}>
          {s.extra}
          {s.points.map((p, i) => (
            <View key={i} style={styles.point}>
              <Text style={styles.bullet}>•</Text>
              <Text style={styles.pointText}>{p}</Text>
            </View>
          ))}
        </ScrollView>
        <View style={styles.buttons}>
          {step > 0 ? (
            <Pressable
              onPress={() => setStep(step - 1)}
              accessibilityRole="button"
              style={({ pressed }) => [styles.btn, styles.back, pressed && { opacity: 0.7 }]}
            >
              <Text style={styles.btnText}>Back</Text>
            </Pressable>
          ) : null}
          <Pressable
            onPress={() => (last ? finish() : setStep(step + 1))}
            accessibilityRole="button"
            style={({ pressed }) => [styles.btn, styles.next, pressed && { opacity: 0.7 }]}
          >
            <Text style={styles.btnText}>{last ? 'Start using SyncSlate' : 'Next'}</Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

/**
 * First-run guided tour: walks through the cue list, cutting snippets, the slate,
 * the report, the new-day message and settings, opening each screen as it goes.
 * Shown until finished or skipped; Settings can replay it.
 */
export function GuidedTour() {
  const tourDone = useAppStore((s) => s.tourDone);
  if (tourDone) return null;
  return <TourCard />;
}

const styles = StyleSheet.create({
  backdrop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'flex-end',
    zIndex: 3000,
  },
  card: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 18,
    paddingTop: 16,
    gap: 10,
    width: '100%',
    maxWidth: 640,
    alignSelf: 'center',
  },
  topRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  eyebrow: { color: colors.accent, fontSize: 13, fontWeight: '800', letterSpacing: 1, textTransform: 'uppercase' },
  skip: { color: colors.textDim, fontSize: 15, fontWeight: '600' },
  progress: { flexDirection: 'row', gap: 6 },
  dot: { flex: 1, height: 4, borderRadius: 2, backgroundColor: colors.border },
  dotOn: { backgroundColor: colors.accent },
  title: { color: colors.text, fontSize: 24, fontWeight: '900' },
  point: { flexDirection: 'row', gap: 8 },
  bullet: { color: colors.accent, fontSize: 16, lineHeight: 22, fontWeight: '900' },
  pointText: { color: colors.text, fontSize: 16, lineHeight: 22, flex: 1 },
  buttons: { flexDirection: 'row', gap: 10, marginTop: 4 },
  btn: { flex: 1, minHeight: 50, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  back: { backgroundColor: colors.surfaceAlt, borderWidth: 1, borderColor: colors.border, flex: 0.6 },
  next: { backgroundColor: colors.accent },
  btnText: { color: '#fff', fontSize: 17, fontWeight: '800' },
  mock: {
    alignSelf: 'center',
    width: '86%',
    backgroundColor: colors.bg,
    borderRadius: 14,
    borderWidth: 2,
    borderColor: colors.accent,
    padding: 12,
    gap: 10,
    marginBottom: 4,
  },
  mockTitle: { color: colors.text, fontSize: 18, fontWeight: '900', textAlign: 'center' },
  mockButtons: { flexDirection: 'row', gap: 8 },
  mockBtn: { flex: 1, minHeight: 36, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  mockNo: { backgroundColor: colors.surfaceAlt },
  mockYes: { backgroundColor: colors.accent },
  mockBtnText: { color: '#fff', fontSize: 15, fontWeight: '800' },
});
