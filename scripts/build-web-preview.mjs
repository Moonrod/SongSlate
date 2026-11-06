#!/usr/bin/env node
/**
 * Builds the browser preview of SyncSlate into dist-preview/site:
 *   index.html               page body (the host adds <html>/<head>/<body>)
 *   syncslate.js             the app bundle (expo-router swapped for an in-memory navigator)
 *   demo-click-120bpm.wav    demo cue so the slate works before anything is imported
 *
 * Usage: npm run preview:web
 * Serve dist-preview/site with any static server to try it locally, e.g.
 *   npx serve dist-preview/site
 */
import { spawnSync } from 'node:child_process';
import { copyFileSync, mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const exportDir = join(root, 'dist-preview', 'export');
const siteDir = join(root, 'dist-preview', 'site');

rmSync(join(root, 'dist-preview'), { recursive: true, force: true });

const result = spawnSync(
  'npx',
  ['expo', 'export', '--platform', 'web', '--output-dir', exportDir, '--clear'],
  { cwd: root, stdio: 'inherit', env: { ...process.env, SYNCSLATE_WEB_PREVIEW: '1' }, shell: process.platform === 'win32' },
);
if (result.status !== 0) process.exit(result.status ?? 1);

const jsDir = join(exportDir, '_expo', 'static', 'js', 'web');
const bundles = readdirSync(jsDir).filter((f) => f.endsWith('.js'));
if (bundles.length !== 1) {
  console.error(`Expected one bundle in ${jsDir}, found: ${bundles.join(', ')}`);
  process.exit(1);
}

mkdirSync(siteDir, { recursive: true });
copyFileSync(join(jsDir, bundles[0]), join(siteDir, 'syncslate.js'));
writeFileSync(join(siteDir, 'demo-click-120bpm.wav'), makeDemoTrack());
writeFileSync(
  join(siteDir, 'index.html'),
  `<title>SyncSlate Preview</title>
<style>
  /* The slate is a single dark look by design: red/green full-bleed, dark menus. */
  :root { --bg: #0e0e10; color-scheme: dark; }
  html, body { height: 100%; margin: 0; overflow: hidden; background: var(--bg); }
  body { -webkit-tap-highlight-color: transparent; }
  #root { display: flex; height: 100%; flex: 1; }
  noscript { color: #f4f4f5; font: 16px system-ui, sans-serif; padding: 24px; display: block; }
</style>
<noscript>SyncSlate needs JavaScript to run.</noscript>
<div id="root"></div>
<script src="syncslate.js" defer></script>
`,
);

console.log(`\nWeb preview written to ${siteDir}`);

/**
 * 32 s mono 16-bit WAV: 120 BPM click (accented downbeat) over a simple
 * four-chord bass line, so beats can be matched against the running timecode.
 */
function makeDemoTrack() {
  const rate = 44100;
  const seconds = 32;
  const frames = rate * seconds;
  const data = new Int16Array(frames);
  const beat = 0.5; // 120 BPM
  const bassNotes = [110, 87.31, 130.81, 98]; // A2, F2, C3, G2 — one per bar
  for (let i = 0; i < frames; i++) {
    const t = i / rate;
    const beatIndex = Math.floor(t / beat);
    const tb = t - beatIndex * beat;
    const downbeat = beatIndex % 4 === 0;
    const clickFreq = downbeat ? 1600 : 1000;
    const click = tb < 0.04 ? Math.sin(2 * Math.PI * clickFreq * tb) * Math.exp(-tb * 90) * (downbeat ? 0.9 : 0.6) : 0;
    const bar = Math.floor(beatIndex / 4);
    const tBar = t - bar * 4 * beat;
    const f = bassNotes[bar % bassNotes.length];
    const bass = Math.sin(2 * Math.PI * f * t) * 0.18 * Math.exp(-tBar * 0.9);
    data[i] = Math.max(-1, Math.min(1, click + bass)) * 32767;
  }
  const header = Buffer.alloc(44);
  header.write('RIFF', 0);
  header.writeUInt32LE(36 + data.byteLength, 4);
  header.write('WAVE', 8);
  header.write('fmt ', 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20); // PCM
  header.writeUInt16LE(1, 22); // mono
  header.writeUInt32LE(rate, 24);
  header.writeUInt32LE(rate * 2, 28);
  header.writeUInt16LE(2, 32);
  header.writeUInt16LE(16, 34);
  header.write('data', 36);
  header.writeUInt32LE(data.byteLength, 40);
  return Buffer.concat([header, Buffer.from(data.buffer)]);
}
