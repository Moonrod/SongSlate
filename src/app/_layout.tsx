import { Stack } from 'expo-router';
import { useKeepAwake } from 'expo-keep-awake';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { audioEngine } from '../audio/SlateAudioEngine';
import { applyOrientation } from '../services/device';
import { useAppStore } from '../state/store';
import { colors } from '../ui/theme';

export default function RootLayout() {
  // Screen stays awake for as long as the app is open.
  useKeepAwake();

  const hydrated = useAppStore((s) => s.hydrated);
  const orientation = useAppStore((s) => s.settings.orientation);

  useEffect(() => {
    // Configure the audio session (silent switch, interruptions) and warm the output.
    audioEngine.init().catch(() => {
      // Surfaced on the slate when loading the first cue.
    });
  }, []);

  useEffect(() => {
    if (hydrated) useAppStore.getState().ensureActiveSession();
  }, [hydrated]);

  useEffect(() => {
    void applyOrientation(orientation);
  }, [orientation]);

  if (!hydrated) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.slateRed, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator color="#fff" size="large" />
      </View>
    );
  }

  return (
    <SafeAreaProvider>
      <StatusBar style="light" />
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: colors.surface },
          headerTintColor: colors.text,
          headerTitleStyle: { fontWeight: '700' },
          contentStyle: { backgroundColor: colors.bg },
        }}
      >
        <Stack.Screen name="index" options={{ headerShown: false, title: 'Slate' }} />
        <Stack.Screen name="cues" options={{ title: 'Cue List' }} />
        <Stack.Screen name="cue/[id]" options={{ title: 'Edit Cue' }} />
        <Stack.Screen name="report" options={{ title: 'Report' }} />
        <Stack.Screen name="settings" options={{ title: 'Settings' }} />
      </Stack>
    </SafeAreaProvider>
  );
}
