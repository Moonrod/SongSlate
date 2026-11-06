import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { ActivityIndicator, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { useAppBootstrap } from '../app-shell/useAppBootstrap';
import { colors } from '../ui/theme';

export default function RootLayout() {
  const hydrated = useAppBootstrap();

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
        <Stack.Screen name="section" options={{ title: 'New Section' }} />
        <Stack.Screen name="report" options={{ title: 'Report' }} />
        <Stack.Screen name="settings" options={{ title: 'Settings' }} />
      </Stack>
    </SafeAreaProvider>
  );
}
