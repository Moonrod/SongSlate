import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';
import { useEffect } from 'react';
import { Platform } from 'react-native';

import { audioEngine } from '../audio/SlateAudioEngine';
import { applyOrientation } from '../services/device';
import { useAppStore } from '../state/store';

const KEEP_AWAKE_TAG = 'syncslate';

/**
 * On the web (browser preview), a page embedded in a frame may not be allowed to
 * keep the screen awake; asking anyway makes the browser log a policy violation.
 */
function wakeLockAllowed(): boolean {
  if (Platform.OS !== 'web') return true;
  try {
    const doc = document as Document & {
      permissionsPolicy?: { allowsFeature(f: string): boolean };
      featurePolicy?: { allowsFeature(f: string): boolean };
    };
    const policy = doc.permissionsPolicy ?? doc.featurePolicy;
    if (policy && !policy.allowsFeature('screen-wake-lock')) return false;
    return 'wakeLock' in navigator;
  } catch {
    return false;
  }
}

/**
 * App-wide start-up shared by the native app (src/app/_layout.tsx) and the web
 * preview (src/preview): keep-awake, audio session + warm output, an active
 * session once storage has loaded, and the orientation lock.
 * Returns true once saved data has loaded.
 */
export function useAppBootstrap(): boolean {
  // Screen stays awake for as long as the app is open.
  useEffect(() => {
    if (!wakeLockAllowed()) return;
    activateKeepAwakeAsync(KEEP_AWAKE_TAG).catch(() => {});
    return () => {
      deactivateKeepAwake(KEEP_AWAKE_TAG).catch(() => {});
    };
  }, []);

  const hydrated = useAppStore((s) => s.hydrated);
  const orientation = useAppStore((s) => s.settings.orientation);

  useEffect(() => {
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

  return hydrated;
}
