import { router, useFocusEffect } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useEffect, useRef } from 'react';
import { AppState, Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { cueTimecodeBase } from '../domain/section';
import { cueDotEmoji } from '../domain/dots';
import { speedLabel } from '../domain/speed';
import { formatSlateTimecode } from '../domain/timecode';
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
  // Sections show the original song's timecode, so their start is always a timecode.
  const startLabel = armedCue
    ? armedCue.startMode === 'full' && !armedCue.section
      ? 'FULL SONG'
      : formatSlateTimecode(
          cueTimecodeBase(armedCue) + (armedCue.startMode === 'timecode' ? armedCue.startSeconds : 0),
          settings.frameRate,
          settings.dropFrame,
        )
    : '';

  const onSwipe = (dir: 'next' | 'prev') => {
    if (canNavigate) armRelative(dir === 'next' ? 1 : -1);
  };

  const infoSize = Math.round(short * (landscape ? 0.06 : 0.07));
  // "00:00:00" (MM:SS:FF, no hours) is 8 glyphs ≈ 5.1 em wide; fill the usable width without clipping.
  const usableWidth = width - insets.left - insets.right - 24;
  // While playing, the title is as big as the timecode, so both must fit with the take line and bars.
  const chrome = insets.top + insets.bottom + 16 + 44 * 2 + 28 + infoSize * 1.4;
  // A sped-up/slowed section adds a "2x F" / "2x S" badge (half size) after the timecode.
  const speedTag = speedLabel(armedCue?.speed);
  const bigSize = Math.floor(Math.min(usableWidth / (speedTag ? 6.8 : 5.1), (height - chrome) / 2.5));
  const badge = speedTag ? <Text style={{ fontSize: Math.round(bigSize * 0.5) }}>{` ${speedTag}`}</Text> : null;
  // Playing: title as big as the timecode. Portrait wraps up to 3 lines at that size;
  // only names too long even for that are scaled down (conservative estimate: heavy glyph ≈ 0.72 em).
  const titleLines = isGreen ? (landscape ? 1 : 3) : 2;
  const titleText = armedCue?.name ?? 'SyncSlate';
  const dotEmoji = armedCue ? cueDotEmoji(armedCue) : null;
  const fitTitle = (max: number) => {
    const avail = usableWidth;
    const chars = titleText.length + (dotEmoji ? 2 : 0);
    const longestWord = Math.max(...titleText.split(/\s+/).map((w) => w.length), 1);
    const byWord = avail / (longestWord * 0.72);
    const byTotal = (avail * titleLines * 0.85) / (chars * 0.72);
    return Math.floor(Math.min(max, byWord, byTotal));
  };
  const titleSize = isGreen ? fitTitle(bigSize) : Math.round(short * (landscape ? 0.075 : 0.085));
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
            style={[styles.title, { color: fg, fontSize: titleSize, lineHeight: titleSize * 1.12 }]}
            numberOfLines={titleLines}
            adjustsFontSizeToFit
            accessibilityRole="header"
          >
            {dotEmoji ? (
              // Dark outline keeps a green dot visible on the green screen.
              <Text style={styles.dotEmoji} accessibilityLabel="Cue colour">
                {dotEmoji}{' '}
              </Text>
            ) : null}
            {titleText}
          </Text>
          {armedCue && !isGreen ? (
            <Text style={[styles.file, { color: fg, fontSize: Math.round(titleSize * 0.45) }]} numberOfLines={1}>
              {/* A section shows the file it was cut from (e.g. the original song's .wav). */}
              {armedCue.section?.sourceFileName ?? armedCue.originalFileName}
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
                {badge}
              </Text>
            ) : view.phase === 'countdown' ? null : (
              <Text
                style={[styles.big, monoDigits, { color: fg, fontSize: startLabel === 'FULL SONG' ? bigSize * 0.9 : bigSize }]}
                numberOfLines={1}
                adjustsFontSizeToFit
              >
                {startLabel}
                {startLabel !== 'FULL SONG' ? badge : null}
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
  title: { fontWeight: '900', textAlign: 'center', alignSelf: 'stretch' },
  dotEmoji: { textShadowColor: 'rgba(0,0,0,0.9)', textShadowOffset: { width: 0, height: 0 }, textShadowRadius: 4 },
  file: { fontWeight: '600', opacity: 0.85, textAlign: 'center' },
  bigArea: { alignSelf: 'stretch', alignItems: 'center', justifyContent: 'center', minHeight: 80, marginVertical: 8 },
  big: { fontWeight: '900', textAlign: 'center' },
  countdown: { fontWeight: '900', textAlign: 'center' },
  take: { fontWeight: '900', letterSpacing: 2 },
  error: { fontSize: 16, fontWeight: '700', textAlign: 'center', marginTop: 8 },
  cueCounter: { fontWeight: '800', fontSize: 16, letterSpacing: 1 },
  hint: { textAlign: 'center', fontWeight: '800', fontSize: 14, letterSpacing: 2, opacity: 0.85, marginTop: 6 },
});
