// The deploy stamps the commit into the page, and something has to notice when
// the thing it stamps into disappears.
//
// The marker used to live in the credits panel. Removing that panel took the
// placeholder with it, so the workflow's sed matched nothing and quietly
// stopped recording which build was live. A substitution that finds nothing
// succeeds, which is what made it silent.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const html = readFileSync('public/index.html', 'utf8');
const build = readFileSync('tools/build.sh', 'utf8');
const workflow = readFileSync('.github/workflows/pages.yml', 'utf8');

test('the page carries the version placeholder', () => {
  assert.match(html, /__COMMIT__/, 'nothing for the deploy to stamp the commit into');
});

test('the placeholder sits somewhere the UI cannot strip away', () => {
  // A meta tag survives the interface being simplified; a visible element does
  // not, as the credits panel demonstrated.
  assert.match(html, /<meta\s+name="version"\s+content="__COMMIT__">/);
});

test('the build still substitutes it', () => {
  // The substitution moved out of the workflow when Cloudflare Pages became a
  // second builder — a step defined in one of them would be skipped by the
  // other, so both now call tools/build.sh.
  assert.match(build, /__COMMIT__/, 'the build no longer stamps a version');
});

test('both builders run the same build', () => {
  assert.match(workflow, /bash tools\/build\.sh/, 'the workflow does not call the build script');
});

test('the build takes its commit from whichever builder is running', () => {
  // Cloudflare and GitHub name it differently, and neither is present locally.
  assert.match(build, /CF_PAGES_COMMIT_SHA/, 'Cloudflare Pages would stamp nothing');
  assert.match(build, /GITHUB_SHA/, 'GitHub Actions would stamp nothing');
  assert.match(build, /git rev-parse HEAD/, 'a local run would stamp nothing');
});

test('the build fails loudly if the placeholder goes missing', () => {
  // sed finding no match succeeds, which is how the version marker was lost
  // once already.
  assert.match(build, /grep -q "__COMMIT__"/, 'a no-op substitution would be silent again');
});
