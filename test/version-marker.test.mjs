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

const html = readFileSync('site/index.html', 'utf8');
const workflow = readFileSync('.github/workflows/pages.yml', 'utf8');

test('the page carries the version placeholder', () => {
  assert.match(html, /__COMMIT__/, 'nothing for the deploy to stamp the commit into');
});

test('the placeholder sits somewhere the UI cannot strip away', () => {
  // A meta tag survives the interface being simplified; a visible element does
  // not, as the credits panel demonstrated.
  assert.match(html, /<meta\s+name="version"\s+content="__COMMIT__">/);
});

test('the workflow still substitutes it', () => {
  assert.match(workflow, /__COMMIT__/, 'the deploy no longer stamps a version');
});

test('the workflow fails loudly if the placeholder goes missing', () => {
  assert.match(workflow, /grep -q "__COMMIT__"/, 'a no-op substitution would be silent again');
});
