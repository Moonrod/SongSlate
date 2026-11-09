/**
 * Entry point of the browser preview build (npm run preview:web).
 * metro.config.js points `expo-router/entry` here when SYNCSLATE_WEB_PREVIEW=1.
 *
 * Start-up must never leave a blank page: storage gets a time limit, and any
 * crash is shown on screen (see PreviewErrorBoundary and showStartupError).
 */
import { registerRootComponent } from 'expo';
import { Component, type ReactNode } from 'react';
import { ScrollView, Text, View } from 'react-native';

import { initWebAudioFiles } from '../services/audioFiles.web';
import { installPreviewDialogs } from './dialogs';
import PreviewApp from './PreviewApp';

const STORAGE_WAIT_MS = 2000;

/** Plain-DOM message for failures before React is running. */
function showStartupError(err: unknown) {
  const root = document.getElementById('root');
  if (!root || root.dataset.started === '1') return;
  const text = err instanceof Error ? `${err.name}: ${err.message}` : String(err);
  root.innerHTML = '';
  const box = document.createElement('div');
  box.setAttribute('role', 'alert');
  box.style.cssText = 'color:#f4f4f5;font:16px/1.5 system-ui,sans-serif;padding:24px;max-width:640px';
  const h = document.createElement('h1');
  h.textContent = 'SyncSlate couldn’t start in this browser';
  h.style.cssText = 'font-size:20px;margin:0 0 8px';
  const p = document.createElement('p');
  p.textContent = 'Please send this message to whoever set up the preview:';
  const pre = document.createElement('pre');
  pre.textContent = `${text}\n${navigator.userAgent}`;
  pre.style.cssText = 'white-space:pre-wrap;background:#1b1b1f;padding:12px;border-radius:8px;font-size:13px';
  box.append(h, p, pre);
  root.append(box);
}

class PreviewErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  render() {
    const { error } = this.state;
    if (!error) return this.props.children;
    return (
      <ScrollView style={{ flex: 1, backgroundColor: '#0e0e10' }} contentContainerStyle={{ padding: 24, gap: 10 }}>
        <Text accessibilityRole="header" style={{ color: '#f4f4f5', fontSize: 20, fontWeight: '800' }}>
          Something went wrong in the preview
        </Text>
        <Text style={{ color: '#a1a1aa', fontSize: 15 }}>Reload the page to try again. If it keeps happening, send this message:</Text>
        <View style={{ backgroundColor: '#1b1b1f', borderRadius: 8, padding: 12 }}>
          <Text selectable style={{ color: '#f4f4f5', fontSize: 13 }}>
            {`${error.name}: ${error.message}\n${navigator.userAgent}`}
          </Text>
        </View>
      </ScrollView>
    );
  }
}

function Root() {
  return (
    <PreviewErrorBoundary>
      <PreviewApp />
    </PreviewErrorBoundary>
  );
}

window.addEventListener('error', (e) => showStartupError(e.error ?? e.message));

function start() {
  try {
    registerRootComponent(Root);
    const root = document.getElementById('root');
    if (root) root.dataset.started = '1';
  } catch (e) {
    showStartupError(e);
  }
}

try {
  installPreviewDialogs();
} catch {
  // Dialogs fall back to React Native Web's (silent) Alert.
}

// Imported audio is restored from browser storage first, but never wait on it forever.
let started = false;
const startOnce = () => {
  if (started) return;
  started = true;
  start();
};
setTimeout(startOnce, STORAGE_WAIT_MS);
initWebAudioFiles()
  .catch(() => {})
  .finally(startOnce);
