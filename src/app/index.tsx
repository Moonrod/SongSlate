import { router, useFocusEffect } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useEffect, useRef } from 'react';
import { AppState, Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { formatTimecode } from '../domain/timecode';
import { boostBrightness, restoreBrightness } from '../services/device';
import { useSlateController } from '../slate/useSlateController';
import { selectActiveSession, useAppStore } from '../state/store';
import { SlateSurface } from '../ui/SlateSurface';
import { colors, monoDigits } from '../ui/theme';

function NavButton({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      hitSlop={8}
      style={({ pressed }) => [styles.navButton, pressed && { opacity: 0.6 }]}
    >
      <Text style={styles.navButtonText}>{label}</Text>
    </Pressable>
  );
}

export default function SlateScreen() {
  const { view, armedCue, onTap, onLongPress, canNavigate } = useSlateController();
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();

  const settings = useAppStore((s) => s.settings);
  const cues = useAppStore((s) => s.cues);
  const nextTake = useAppStore((s) => selectActiveSession(s)?.nextTake ?? 1);
  const armRelative = useAppStore((s) => s.armRelative);

  // Max brightness while the slate is on screen; restore when leaving it or backgrounding.
  const focused = useRef(false);
  useFocusEffect(
    useCallback(() => {
      focused.current = true;
      void boostBrightness();
      return () => {
        focused.current = false;
        void restoreBrightness();
      };
    }, []),
  );
  useEffect(() => {
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'active' && focused.current) void boostBrightness();
      else if (s === 'background') void restoreBrightness();
    });
    return () => sub.remove();
  }, []);

  const isGreen = view.phase === 'playing';
  const fg = isGreen ? colors.onGreen : colors.onRed;
  const short = Math.min(width, height);
  const landscape = width > height;

  const cueIndex = armedCue ? cues.findIndex((c) => c.id === armedCue.id) : -1;
  const startLabel = armedCue
    ? armedCue.startMode === 'full'
      ? 'FULL SONG'
      : formatTimecode(armedCue.startSeconds, settings.frameRate, settings.dropFrame)
    : '';

  const onSwipe = (dir: 'next' | 'prev') => {
    if (canNavigate) armRelative(dir === 'next' ? 1 : -1);
  };

  const titleSize = Math.round(short * (landscape ? 0.075 : 0.085));
  const infoSize = Math.round(short * (landscape ? 0.06 : 0.07));
  // "00:00:00:00" is 11 monospace glyphs ≈ 6.9 em wide; fill the usable width without clipping.
  const usableWidth = width - insets.left - insets.right - 24;
  const bigSize = Math.floor(Math.min(usableWidth / 6.9, height / (landscape ? 2.6 : 3.4)));
  const countdownSize = Math.round(Math.min(width, height) * 0.55);

  let hint = '';
  if (view.phase === 'armed') hint = 'TAP ANYWHERE TO START';
  else if (view.phase === 'loading') hint = 'LOADING AUDIO…';
  else if (view.phase === 'empty') hint = 'NO CUES — OPEN CUES TO IMPORT AUDIO';
  else if (view.phase === 'error') hint = 'TAP TO RETRY';
  else if (view.phase === 'playing' || view.phase === 'countdown')
    hint = settings.stopGesture === 'longPress' ? 'LONG-PRESS TO STOP' : 'TAP TO STOP';

  return (
    <SlateSurface
      onTap={onTap}
      onLongPress={onLongPress}
      onSwipe={onSwipe}
      style={{ backgroundColor: isGreen ? colors.slateGreen : colors.slateRed }}
    >
      <StatusBar hidden />
      <View
        style={[
          styles.container,
          {
            paddingTop: insets.top + 8,
            paddingBottom: insets.bottom + 8,
            paddingLeft: insets.left + 12,
            paddingRight: insets.right + 12,
          },
        ]}
      >
        {/* Top bar: hidden while a take is running so nothing can be hit by accident. */}
        <View style={[styles.topBar, !canNavigate && styles.hidden]} pointerEvents={canNavigate ? 'auto' : 'none'}>
          <NavButton label="CUES" onPress={() => router.push('/cues')} />
          <NavButton label="REPORT" onPress={() => router.push('/report')} />
          <NavButton label="SETTINGS" onPress={() => router.push('/settings')} />
        </View>

        <View style={styles.center}>
          <Text
            style={[styles.title, { color: fg, fontSize: titleSize }]}
            numberOfLines={2}
            adjustsFontSizeToFit
            accessibilityRole="header"
          >
            {armedCue?.name ?? 'SyncSlate'}
          </Text>
          {armedCue ? (
            <Text style={[styles.file, { color: fg, fontSize: Math.round(titleSize * 0.45) }]} numberOfLines={1}>
              {armedCue.originalFileName}
            </Text>
          ) : null}

          <View style={styles.bigArea}>
            {view.phase === 'countdown' && view.countdown != null ? (
              <Text style={[styles.countdown, { color: fg, fontSize: countdownSize, lineHeight: countdownSize * 1.05 }]}>
                {view.countdown}
              </Text>
            ) : view.phase === 'playing' ? (
              <Text
                style={[styles.big, monoDigits, { color: fg, fontSize: bigSize }]}
                numberOfLines={1}
                adjustsFontSizeToFit
              >
                {view.timecode}
              </Text>
            ) : view.phase === 'countdown' ? null : (
              <Text
                style={[styles.big, monoDigits, { color: fg, fontSize: startLabel === 'FULL SONG' ? bigSize * 0.9 : bigSize }]}
                numberOfLines={1}
                adjustsFontSizeToFit
              >
                {startLabel}
              </Text>
            )}
          </View>

          <Text style={[styles.take, { color: fg, fontSize: infoSize }]}>TAKE {nextTake}</Text>
          {view.error ? <Text style={[styles.error, { color: fg }]}>{view.error}</Text> : null}
        </View>

        <View style={[styles.bottomBar, !canNavigate && styles.hidden]} pointerEvents={canNavigate ? 'auto' : 'none'}>
          <NavButton label="◀ PREV" onPress={() => armRelative(-1)} />
          <Text style={[styles.cueCounter, { color: fg }]}>
            {cues.length ? `CUE ${cueIndex + 1}/${cues.length}` : ''}
          </Text>
          <NavButton label="NEXT ▶" onPress={() => armRelative(1)} />
        </View>
        <Text style={[styles.hint, { color: fg }]}>{hint}</Text>
      </View>
    </SlateSurface>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, userSelect: 'none' },
  hidden: { opacity: 0 },
  topBar: { flexDirection: 'row', justifyContent: 'space-between', gap: 8 },
  bottomBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  navButton: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 8,
    backgroundColor: 'rgba(0,0,0,0.22)',
    minHeight: 44,
    justifyContent: 'center',
  },
  navButtonText: { color: '#fff', fontWeight: '800', fontSize: 15, letterSpacing: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 6 },
  title: { fontWeight: '900', textAlign: 'center' },
  file: { fontWeight: '600', opacity: 0.85, textAlign: 'center' },
  bigArea: { alignSelf: 'stretch', alignItems: 'center', justifyContent: 'center', minHeight: 80, marginVertical: 8 },
  big: { fontWeight: '900', textAlign: 'center' },
  countdown: { fontWeight: '900', textAlign: 'center' },
  take: { fontWeight: '900', letterSpacing: 2 },
  error: { fontSize: 16, fontWeight: '700', textAlign: 'center', marginTop: 8 },
  cueCounter: { fontWeight: '800', fontSize: 16, letterSpacing: 1 },
  hint: { textAlign: 'center', fontWeight: '800', fontSize: 14, letterSpacing: 2, opacity: 0.85, marginTop: 6 },
});
