#!/usr/bin/env node
/**
 * Builds the browser preview of SyncSlate into dist-preview/site:
 *   index.html               page body (the host adds <html>/<head>/<body>)
 *   syncslate.js             the app bundle (expo-router swapped for an in-memory navigator)
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
  .boot { margin: auto; color: #f4f4f5; font: 600 18px system-ui, -apple-system, sans-serif; letter-spacing: 0.04em; }
</style>
<noscript>SyncSlate needs JavaScript to run.</noscript>
<!-- Shown until the app has loaded (the bundle is ~0.9 MB), then replaced by it. -->
<div id="root"><div class="boot" role="status">Loading SyncSlate…</div></div>
<script src="syncslate.js" defer></script>
`,
);

console.log(`\nWeb preview written to ${siteDir}`);
