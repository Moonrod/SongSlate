/**
 * Browser preview shell: the same screens as the phone app, navigated with an
 * in-memory stack (see routerShim.tsx) instead of expo-router.
 */
import { useCallback, useEffect, useState, type ComponentType } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { GuidedTour } from '../app-shell/GuidedTour';
import { NewShootPrompt } from '../app-shell/NewShootPrompt';
import { useAppBootstrap } from '../app-shell/useAppBootstrap';
import EditCueScreen from '../app/cue/[id]';
import CueListScreen from '../app/cues';
import SlateScreen from '../app/index';
import ReportScreen from '../app/report';
import NewSectionScreen from '../app/section';
import SettingsScreen from '../app/settings';
import { audioEngine } from '../audio/SlateAudioEngine';
import { LEGACY_DEMO_STORED_NAME } from '../services/audioFiles.web';
import { useAppStore } from '../state/store';
import { colors } from '../ui/theme';
import { DialogHost } from './dialogs';
import { router, ScreenContext, usePreviewStack, type PreviewRoute, type RouteName, type ScreenOptions } from './routerShim';

const SCREENS: Record<RouteName, { component: ComponentType; title: string }> = {
  index: { component: SlateScreen, title: 'Slate' },
  cues: { component: CueListScreen, title: 'Cue List' },
  cue: { component: EditCueScreen, title: 'Edit Cue' },
  section: { component: NewSectionScreen, title: 'New Section' },
  report: { component: ReportScreen, title: 'Report' },
  settings: { component: SettingsScreen, title: 'Settings' },
};

function ScreenFrame({ route, focused }: { route: PreviewRoute; focused: boolean }) {
  const [options, setOptionsState] = useState<ScreenOptions>({});
  const setOptions = useCallback((o: ScreenOptions) => setOptionsState((prev) => ({ ...prev, ...o })), []);
  const { component: Screen, title } = SCREENS[route.name];
  const showHeader = route.name !== 'index';

  return (
    <ScreenContext.Provider value={{ route, focused, setOptions }}>
      <View style={[StyleSheet.absoluteFill, !focused && styles.hidden]} pointerEvents={focused ? 'auto' : 'none'}>
        {showHeader ? (
          <View style={styles.header}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Back"
              onPress={() => router.back()}
              hitSlop={10}
              style={styles.headerSide}
            >
              <Text style={styles.back}>‹ Back</Text>
            </Pressable>
            <Text style={styles.headerTitle} numberOfLines={1}>
              {options.title ?? title}
            </Text>
            <View style={[styles.headerSide, { alignItems: 'flex-end' }]}>{options.headerRight?.()}</View>
          </View>
        ) : null}
        <View style={{ flex: 1, backgroundColor: showHeader ? colors.bg : undefined }}>
          <Screen />
        </View>
      </View>
    </ScreenContext.Provider>
  );
}

export default function PreviewApp() {
  const hydrated = useAppBootstrap();
  const stack = usePreviewStack();

  // Earlier previews added a demo track; remove it if it's still in the list.
  useEffect(() => {
    if (!hydrated) return;
    const state = useAppStore.getState();
    const demo = state.cues.filter((c) => c.storedFileName === LEGACY_DEMO_STORED_NAME).map((c) => c.id);
    if (demo.length) state.removeCues(demo);
  }, [hydrated]);

  // Browsers only allow audio to start from a user gesture.
  useEffect(() => {
    const unlock = () => audioEngine.unlock();
    document.addEventListener('pointerdown', unlock, true);
    return () => document.removeEventListener('pointerdown', unlock, true);
  }, []);

  if (!hydrated) {
    return (
      <View style={[styles.fill, { backgroundColor: colors.slateRed, alignItems: 'center', justifyContent: 'center' }]}>
        <ActivityIndicator color="#fff" size="large" />
      </View>
    );
  }

  return (
    <SafeAreaProvider>
      <View style={[styles.fill, { backgroundColor: colors.bg }]}>
        {stack.map((route, i) => (
          <ScreenFrame key={route.key} route={route} focused={i === stack.length - 1} />
        ))}
        <NewShootPrompt />
        <GuidedTour />
        <DialogHost />
      </View>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  hidden: { opacity: 0 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    minHeight: 52,
    backgroundColor: colors.surface,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  headerSide: { width: 110, justifyContent: 'center' },
  back: { color: colors.accent, fontSize: 17, fontWeight: '600' },
  headerTitle: { flex: 1, textAlign: 'center', color: colors.text, fontSize: 17, fontWeight: '700' },
});
