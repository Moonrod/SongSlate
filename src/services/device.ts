import * as Brightness from 'expo-brightness';
import * as ScreenOrientation from 'expo-screen-orientation';
import { Platform } from 'react-native';

import type { OrientationSetting } from '../domain/types';

export async function applyOrientation(setting: OrientationSetting): Promise<void> {
  try {
    await ScreenOrientation.lockAsync(
      setting === 'landscape'
        ? ScreenOrientation.OrientationLock.LANDSCAPE
        : ScreenOrientation.OrientationLock.PORTRAIT_UP,
    );
  } catch {
    // Not supported (e.g. iPad split view) — ignore.
  }
}

let savedBrightness: number | null = null;

/** Max brightness for the slate. Remembers the previous level so it can be restored. */
export async function boostBrightness(): Promise<void> {
  try {
    if (savedBrightness === null) {
      savedBrightness = await Brightness.getBrightnessAsync();
    }
    await Brightness.setBrightnessAsync(1);
  } catch {
    // Brightness control unavailable (simulator) — ignore.
  }
}

export async function restoreBrightness(): Promise<void> {
  try {
    if (Platform.OS === 'android') {
      // Android brightness is per-window: hand control back to the system setting.
      await Brightness.restoreSystemBrightnessAsync();
    } else if (savedBrightness !== null) {
      // iOS brightness is global, so put the user's level back.
      await Brightness.setBrightnessAsync(savedBrightness);
    }
  } catch {
    // ignore
  } finally {
    savedBrightness = null;
  }
}
