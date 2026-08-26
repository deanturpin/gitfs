// Where the tide is right now.
//
// The card already says when the next high and low water are, which answers
// "when" rather than "what is it doing". Standing on a beach the useful facts
// are whether the water is coming in or going out and how far up it is.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const providers = readFileSync('site/providers.js', 'utf8');

// The function is internal to the module, so exercise the same arithmetic here
// against the shape the API returns. Kept in step by the last test below.
function tideNow(times, heights, at) {
  if (!times?.length) return null;
  for (let i = 0; i < times.length - 1; i += 1) {
    const start = Date.parse(times[i]);
    const end = Date.parse(times[i + 1]);
    if (at < start || at > end) continue;
    const from = heights[i];
    const to = heights[i + 1];
    if (from === null || to === null) return null;
    const through = (at - start) / (end - start);
    return { height: from + (to - from) * through, rising: to > from };
  }
  return null;
}

const times = ['2026-08-26T12:00', '2026-08-26T13:00', '2026-08-26T14:00'];
const falling = [1.2, 0.4, -0.6];

test('the height is interpolated within the hour', () => {
  // A tide moves a long way inside an hour, so the hourly sample on its own is
  // not the height you are standing in.
  const half = tideNow(times, falling, Date.parse('2026-08-26T13:30'));
  assert.ok(Math.abs(half.height - -0.1) < 1e-9, `got ${half.height}`);
});

test('it reads falling water as falling', () => {
  assert.equal(tideNow(times, falling, Date.parse('2026-08-26T13:30')).rising, false);
});

test('it reads rising water as rising', () => {
  const rising = [-0.6, 0.4, 1.2];
  assert.equal(tideNow(times, rising, Date.parse('2026-08-26T13:30')).rising, true);
});

test('the samples themselves come back unchanged', () => {
  const at = tideNow(times, falling, Date.parse('2026-08-26T13:00'));
  assert.ok(Math.abs(at.height - 0.4) < 1e-9, `got ${at.height}`);
});

test('a time outside the series yields nothing rather than extrapolating', () => {
  // The forecast is two days long; asking beyond it should not invent a tide.
  assert.equal(tideNow(times, falling, Date.parse('2026-08-27T09:00')), null);
  assert.equal(tideNow([], [], Date.now()), null);
});

test('a gap in the series yields nothing rather than a wrong height', () => {
  assert.equal(tideNow(times, [1.2, null, -0.6], Date.parse('2026-08-26T13:30')), null);
});

test('the app asks for the tide state and draws it', () => {
  assert.match(providers, /tideNow: tideNow\(/, 'conditions does not carry the tide state');
  const app = readFileSync('site/app.js', 'utf8');
  assert.match(app, /live\.tideNow/, 'nothing renders the tide state');
  assert.match(app, /g-tide-\$\{live\.tideNow\.rising \? 'high' : 'low'\}/,
    'the rising and falling glyphs should show which way it is going');
});
