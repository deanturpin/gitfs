// Every shipped module parses.
//
// app.js is the entry point and nothing imports it, so no other test would
// notice a syntax error in it — and the browser's complaint is a blank page.
// node --check parses without executing, so browser APIs are not needed.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readdirSync, mkdtempSync, copyFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const modules = readdirSync('site').filter((f) => f.endsWith('.js'));

test('there are modules to check', () => {
  assert.ok(modules.length >= 4, `found only ${modules.length} modules in site/`);
});

for (const name of modules) {
  test(`${name} parses as an ES module`, () => {
    // node --check infers script vs module from the extension, and these ship
    // as .js while being modules, so check a .mjs copy.
    const dir = mkdtempSync(join(tmpdir(), 'gitfs-parse-'));
    try {
      const copy = join(dir, name.replace(/\.js$/, '.mjs'));
      copyFileSync(join('site', name), copy);
      execFileSync(process.execPath, ['--check', copy], { stdio: 'pipe' });
    } catch (error) {
      assert.fail(`${name} failed to parse:\n${error.stderr?.toString() ?? error.message}`);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
}
