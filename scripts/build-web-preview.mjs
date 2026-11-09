#!/usr/bin/env node
/**
 * Builds the browser preview of SyncSlate into dist-preview/site:
 *   index.html   one self-contained page: the page body (the host adds
 *                <html>/<head>/<body>) with the app bundle inlined. A single file,
 *                because some hosted viewers (e.g. the Claude iOS app) fail to
 *                load a page that pulls in a separate script file.
 *
 * Usage: npm run preview:web
 * Serve dist-preview/site with any static server to try it locally, e.g.
 *   npx serve dist-preview/site
 */
import { spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
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
// Inline the bundle. "</script" inside it would end the tag early, so escape it
// (and "<!--", which can switch the HTML parser into a script-comment state).
const bundle = readFileSync(join(jsDir, bundles[0]), 'utf8')
  .replace(/<\/script/gi, '<\\/script')
  .replace(/<!--/g, '<\\!--');
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
<script>
/* Runs before the app. Hosted viewers (e.g. the Claude iOS app) can treat any
   uncaught error in the page as a crash, so: give the app working storage even
   where the browser blocks it, and keep stray errors from escaping the page. */
(function () {
  function memoryStorage() {
    var m = {};
    return {
      getItem: function (k) { return Object.prototype.hasOwnProperty.call(m, k) ? m[k] : null; },
      setItem: function (k, v) { m[k] = String(v); },
      removeItem: function (k) { delete m[k]; },
      clear: function () { m = {}; },
      key: function (i) { return Object.keys(m)[i] || null; },
      get length() { return Object.keys(m).length; }
    };
  }
  ['localStorage', 'sessionStorage'].forEach(function (name) {
    var works = false;
    try { var s = window[name]; s.setItem('__syncslate_probe', '1'); s.removeItem('__syncslate_probe'); works = true; } catch (e) {}
    if (!works) { try { Object.defineProperty(window, name, { value: memoryStorage(), configurable: true }); } catch (e) {} }
  });
  window.addEventListener('error', function (e) { e.preventDefault(); }, true);
  window.addEventListener('unhandledrejection', function (e) { e.preventDefault(); });
})();
</script>
<script>${bundle}</script>
`,
);

console.log(`\nWeb preview written to ${siteDir}`);
