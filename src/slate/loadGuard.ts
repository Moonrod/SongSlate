import { Platform } from 'react-native';

/**
 * Crash-loop guard for the browser preview. Decoding a long song can use more
 * memory than an embedded viewer (e.g. the Claude iOS app) allows, crashing the
 * page; reopening it would arm the same song and crash again. A marker is set
 * before decoding and cleared after, so a marker found at start-up means the
 * last attempt crashed: the slate then waits for a tap instead of retrying.
 * Native builds don't need this.
 */
const KEY = 'syncslate-loading-cue';
const enabled = Platform.OS === 'web';

export function markLoading(storedFileName: string) {
  if (!enabled) return;
  try {
    localStorage.setItem(KEY, storedFileName);
  } catch {
    // Storage unavailable: no guard, but nothing breaks.
  }
}

export function clearLoading() {
  if (!enabled) return;
  try {
    localStorage.removeItem(KEY);
  } catch {
    // ignore
  }
}

export function crashedWhileLoading(storedFileName: string): boolean {
  if (!enabled) return false;
  try {
    return localStorage.getItem(KEY) === storedFileName;
  } catch {
    return false;
  }
}
