import { useKeepAwake } from 'expo-keep-awake';
import { useEffect } from 'react';

import { audioEngine } from '../audio/SlateAudioEngine';
import { applyOrientation } from '../services/device';
import { useAppStore } from '../state/store';

/**
 * App-wide start-up shared by the native app (src/app/_layout.tsx) and the web
 * preview (src/preview): keep-awake, audio session + warm output, an active
 * session once storage has loaded, and the orientation lock.
 * Returns true once saved data has loaded.
 */
export function useAppBootstrap(): boolean {
  // Screen stays awake for as long as the app is open.
  useKeepAwake();

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
