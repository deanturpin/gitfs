// Loads the page in a real browser and fails on any error it logs.
//
// Everything here is ES modules talking to a map library that only fails at
// runtime: a bad import path or a layer referencing a source that does not
// exist throws on load and leaves a blank blue rectangle, which looks exactly
// like a map of the sea. Only a browser can tell the difference.
//
// Usage: node scripts/smoke.mjs [path]
//   Expects a server on PORT (8765 by default) — `make smoke` starts one.

import { spawn } from 'node:child_process';
import { existsSync, rmSync } from 'node:fs';

const CHROME = [
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Chromium.app/Contents/MacOS/Chromium',
].find(existsSync);

if (!CHROME) {
  console.error('No Chrome to drive. Skipping rather than failing: this is a check, not a gate.');
  process.exit(0);
}

const port = process.env.PORT || 8765;
const path = process.argv[2] || '/';
const url = `http://localhost:${port}${path}`;
const profile = `/tmp/gitfs-smoke-${process.pid}`;

// Anything that means the script stopped running. A failed fetch is not on the
// list: this should not go red because Open-Meteo is having a moment.
const FATAL = /ReferenceError|TypeError|SyntaxError|is not defined|is not a function|Failed to resolve module|Unhandled|Failed to fetch/;

// Markers that the page actually built itself, rather than merely serving.
//
// Deliberately not the map canvas. Headless Chrome reports WEBGL_MISSING, so
// MapLibre may create no canvas at all, and asserting on it made this test fail
// perhaps one run in three — which is worse than not testing, because it
// teaches you to rerun until it goes green. Whether the map draws needs a real
// browser and is checked by eye.
//
// data-spots is set once the modules have resolved and the generated data has
// arrived, which is the part that can actually break silently.
const EXPECTED = [
  ['map container', /id="map"/],
  ['glyph set', /id="g-temp"/],
  ['banner', /id="banner"/],
  ['app booted', /data-app="(booting|ready)"/],
  ['swipe glyph', /id="g-swipe"/],
  ['loading swell', /id="loading"[\s\S]*?class="swell/],
  // After the panel, not inside it — the panel scrolls and would clip it. Not
  // adjacent to it, though: other things live between them.
  ['swipe hint outside the scrolling panel', /<\/section>[\s\S]*<div id="swipehint"/],
];

const chrome = spawn(CHROME, [
  '--headless', '--disable-gpu', '--no-sandbox', '--hide-scrollbars',
  '--window-size=1000,900', `--user-data-dir=${profile}`,
  '--enable-logging=stderr', '--v=0',
  // No --virtual-time-budget: it cancels --dump-dom, and Chrome exits having
  // written nothing, which reads as a page that rendered nothing.
  '--dump-dom', url,
], { stdio: ['ignore', 'pipe', 'pipe'] });

let dom = '';
let log = '';
chrome.stdout.on('data', (d) => { dom += d; });
chrome.stderr.on('data', (d) => { log += d; });

await new Promise((resolve) => {
  const kill = setTimeout(() => { chrome.kill('SIGKILL'); resolve(); }, 25_000);
  chrome.on('exit', () => { clearTimeout(kill); resolve(); });
});

rmSync(profile, { recursive: true, force: true });

const errors = log.split('\n')
  .filter((line) => line.includes('CONSOLE') && FATAL.test(line))
  .map((line) => line.replace(/^.*CONSOLE:\d+\]\s*/, '').trim());

const missing = EXPECTED.filter(([, pattern]) => !pattern.test(dom)).map(([name]) => name);

for (const error of errors) console.error(`  error: ${error}`);
for (const name of missing) console.error(`  missing: ${name}`);

if (errors.length || missing.length) {
  console.error(`smoke ${path}: FAILED`);
  process.exit(1);
}
console.log(`smoke ${path}: ok (${dom.length} bytes of DOM)`);
