// WMO weather codes to a handful of glyphs.
//
// The full code list draws distinctions a swimmer does not care about — light
// versus moderate drizzle changes nothing about whether to get in — so these
// collapse to what is worth a picture: clear, grey, or falling on you.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { skyGlyph } from '../public/providers.js';

const html = readFileSync('public/index.html', 'utf8');

test('the recognisable states map as expected', () => {
  assert.equal(skyGlyph(0), 'sun');
  assert.equal(skyGlyph(2), 'suncloud');
  assert.equal(skyGlyph(3), 'cloud');
  assert.equal(skyGlyph(45), 'fog');
  assert.equal(skyGlyph(63), 'rain');
  assert.equal(skyGlyph(73), 'snow');
  assert.equal(skyGlyph(81), 'rain');
  assert.equal(skyGlyph(95), 'storm');
});

test('a clear night is a moon, not a sun', () => {
  assert.equal(skyGlyph(0, false), 'moon');
  assert.equal(skyGlyph(1, false), 'moon');
  assert.equal(skyGlyph(0, true), 'sun');
});

test('overcast looks the same whatever the hour', () => {
  // Only the clear states change with the sun; a grey sky is a grey sky.
  for (const code of [3, 45, 63, 95]) {
    assert.equal(skyGlyph(code, false), skyGlyph(code, true));
  }
});

test('a missing code draws nothing rather than guessing', () => {
  assert.equal(skyGlyph(null), null);
  assert.equal(skyGlyph(undefined), null);
});

test('every code in the WMO range yields a glyph that exists', () => {
  // A code mapping to a symbol that was never drawn renders as empty space.
  const codes = [0, 1, 2, 3, 45, 48, 51, 53, 55, 56, 57, 61, 63, 65, 66, 67,
                 71, 73, 75, 77, 80, 81, 82, 85, 86, 95, 96, 99];
  for (const code of codes) {
    for (const day of [true, false]) {
      const glyph = skyGlyph(code, day);
      assert.ok(glyph, `code ${code} produced no glyph`);
      assert.match(html, new RegExp(`id="g-${glyph}"`), `code ${code} wants missing g-${glyph}`);
    }
  }
});

test('codes never seen still resolve rather than throwing', () => {
  assert.ok(skyGlyph(4));
  assert.ok(skyGlyph(120));
});
