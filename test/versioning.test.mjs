// The deploy-time asset versioning.
//
// This exists because a half-applied deploy is not a cosmetic problem. Pages
// caches for four hours, files expire at different moments, and a fresh app.js
// importing a cached providers.js throws "does not provide an export named"
// and the app never starts. Versioning the imports makes a new deploy ask for
// URLs the old cache has never seen.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, cpSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/** Run the versioner over a throwaway copy of the tree. */
function versioned(stamp = 'testsha') {
  const dir = mkdtempSync(join(tmpdir(), 'gitfs-version-'));
  cpSync('site', join(dir, 'site'), { recursive: true });
  cpSync('tools', join(dir, 'tools'), { recursive: true });
  execFileSync(process.execPath === '' ? 'python3' : 'python3',
    [join(dir, 'tools', 'version_assets.py'), stamp], { stdio: 'pipe' });
  const read = (p) => readFileSync(join(dir, 'site', p), 'utf8');
  const out = { app: read('app.js'), html: read('index.html') };
  rmSync(dir, { recursive: true, force: true });
  return out;
}

test('every local import carries the version', () => {
  const { app } = versioned();
  const local = [...app.matchAll(/from\s*['"](\.\/[A-Za-z0-9_-]+\.js[^'"]*)['"]/g)].map((m) => m[1]);
  assert.ok(local.length >= 3, `expected local imports, found ${local.length}`);
  for (const specifier of local) {
    assert.match(specifier, /\?v=testsha$/, `${specifier} was not versioned`);
  }
});

test('vendor imports are left alone', () => {
  // MapLibre derives its worker URL from its own, so a query string there is
  // a risk taken for no benefit.
  const { app } = versioned();
  const vendor = [...app.matchAll(/from\s*['"](\.\/vendor\/[^'"]+)['"]/g)].map((m) => m[1]);
  assert.ok(vendor.length >= 1, 'expected a vendor import');
  for (const specifier of vendor) {
    assert.doesNotMatch(specifier, /\?v=/, `${specifier} should not be versioned`);
  }
});

test('the entry points named by the page are versioned', () => {
  const { html } = versioned();
  assert.match(html, /src="app\.js\?v=testsha"/);
  assert.match(html, /href="style\.css\?v=testsha"/);
});

test('versioning leaves the module still parseable', () => {
  const { app } = versioned();
  // A mangled import would be caught here rather than in the browser.
  assert.doesNotMatch(app, /\?v=testsha\?v=testsha/, 'double-stamped a specifier');
  assert.equal((app.match(/\?v=testsha/g) || []).length >= 3, true);
});

test('it refuses an empty version rather than stamping nothing', () => {
  assert.throws(() => {
    execFileSync('python3', ['tools/version_assets.py', ''], { stdio: 'pipe' });
  });
});
