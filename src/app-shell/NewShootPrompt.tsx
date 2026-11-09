import { useEffect, useState } from 'react';
import { AccessibilityInfo, Animated, AppState, Pressable, StyleSheet, Text, View } from 'react-native';

import { audioEngine } from '../audio/SlateAudioEngine';
import { deleteCueFile } from '../services/audioFiles';
import { useAppStore } from '../state/store';
import { colors } from '../ui/theme';

/** Local calendar day, e.g. "2026-11-09". */
export function localDay(now = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

/**
 * The first time the app is opened (or brought back) on a new day, flashes
 * "Is this a new shoot?". Yes clears the cue list and its audio files and starts
 * a new report session (takes from 1); No keeps everything. Asked once per day, never during a take, and not at all
 * when the cue list is already empty.
 */
export function NewShootPrompt() {
  // "Today" is re-read when the app comes back to the screen, but never mid-take:
  // a night shoot past midnight is asked the next time the app returns instead.
  const [today, setToday] = useState(localDay);
  const lastShootDay = useAppStore((s) => s.lastShootDay);
  const cueCount = useAppStore((s) => s.cues.length);
  const setLastShootDay = useAppStore((s) => s.setLastShootDay);
  const [flash] = useState(() => new Animated.Value(0));

  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active' && !audioEngine.isPlaying) setToday(localDay());
    });
    return () => sub.remove();
  }, []);

  const newDay = lastShootDay !== today;
  // Nothing to clear: just remember the day.
  useEffect(() => {
    if (newDay && cueCount === 0) setLastShootDay(today);
  }, [newDay, cueCount, today, setLastShootDay]);

  const askingFor = newDay && cueCount > 0 ? today : null;

  // Flash the backdrop a few times to catch the eye (a steady fade with Reduce Motion on).
  useEffect(() => {
    if (!askingFor) return;
    let cancelled = false;
    flash.setValue(0);
    AccessibilityInfo.isReduceMotionEnabled()
      .catch(() => false)
      .then((reduce) => {
        if (cancelled) return;
        const pulse = Animated.sequence([
          Animated.timing(flash, { toValue: 1, duration: 220, useNativeDriver: false }),
          Animated.timing(flash, { toValue: 0.35, duration: 220, useNativeDriver: false }),
        ]);
        (reduce
          ? Animated.timing(flash, { toValue: 0.35, duration: 300, useNativeDriver: false })
          : Animated.loop(pulse, { iterations: 3 })
        ).start();
      });
    return () => {
      cancelled = true;
    };
  }, [askingFor, flash]);

  if (!askingFor) return null;

  const answer = (newShoot: boolean) => {
    if (newShoot) {
      const { cues, removeCues, newSession } = useAppStore.getState();
      removeCues(cues.map((c) => c.id));
      cues.forEach((c) => deleteCueFile(c));
      // A fresh report session for the day: takes start again at 1, and earlier
      // shoots keep their own logs in the report.
      newSession();
    }
    setLastShootDay(askingFor);
  };

  const backdrop = flash.interpolate({ inputRange: [0, 0.35, 1], outputRange: ['rgba(0,0,0,0)', 'rgba(0,0,0,0.78)', 'rgba(209,0,0,0.9)'] });

  return (
    <Animated.View style={[styles.backdrop, { backgroundColor: backdrop }]} accessibilityViewIsModal>
      <View style={styles.card} accessibilityRole="alert">
        <Text style={styles.title}>Is this a new shoot?</Text>
        <Text style={styles.body}>
          {`Yes clears the cue list (${cueCount} cue${cueCount === 1 ? '' : 's'}) and starts a new report session from take 1. No keeps everything as it is.`}
        </Text>
        <View style={styles.buttons}>
          <Pressable
            accessibilityRole="button"
            onPress={() => answer(false)}
            style={({ pressed }) => [styles.button, styles.no, pressed && { opacity: 0.7 }]}
          >
            <Text style={styles.buttonText}>No</Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityHint="Clears the cue list"
            onPress={() => answer(true)}
            style={({ pressed }) => [styles.button, styles.yes, pressed && { opacity: 0.7 }]}
          >
            <Text style={styles.buttonText}>Yes</Text>
          </Pressable>
        </View>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
    zIndex: 2000,
  },
  card: {
    width: '100%',
    maxWidth: 420,
    backgroundColor: colors.surface,
    borderRadius: 18,
    borderWidth: 2,
    borderColor: colors.accent,
    padding: 22,
    gap: 12,
  },
  title: { color: colors.text, fontSize: 28, fontWeight: '900', textAlign: 'center' },
  body: { color: colors.textDim, fontSize: 16, lineHeight: 22, textAlign: 'center' },
  buttons: { flexDirection: 'row', gap: 12, marginTop: 6 },
  button: { flex: 1, minHeight: 56, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  no: { backgroundColor: colors.surfaceAlt, borderWidth: 1, borderColor: colors.border },
  yes: { backgroundColor: colors.accent },
  buttonText: { color: '#fff', fontSize: 20, fontWeight: '800' },
});
