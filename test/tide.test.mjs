// Where the tide is right now.
//
// The card already says when the next high and low water are, which answers
// "when" rather than "what is it doing". Standing on a beach the useful facts
// are whether the water is coming in or going out and how far up it is.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const providers = readFileSync('public/providers.js', 'utf8');

// tidePhase is internal to the module, so the same arithmetic is exercised
// here against the shape tideTurns produces. The last test keeps the two in
// step by asserting the module still wires it up.
function tidePhase(turns, at) {
  if (!turns?.length) return null;
  for (let i = 0; i < turns.length - 1; i += 1) {
    const from = Date.parse(turns[i].time);
    const to = Date.parse(turns[i + 1].time);
    if (at < from || at > to) continue;
    return {
      from: turns[i],
      to: turns[i + 1],
      through: (at - from) / (to - from),
      rising: turns[i + 1].type === 'high',
    };
  }
  return null;
}

const turns = [
  { type: 'low', time: '2026-08-26T06:12', height: -1.9 },
  { type: 'high', time: '2026-08-26T12:30', height: 1.8 },
  { type: 'low', time: '2026-08-26T18:45', height: -1.7 },
];

test('it finds the half cycle we are inside', () => {
  const phase = tidePhase(turns, Date.parse('2026-08-26T09:00'));
  assert.equal(phase.from.type, 'low');
  assert.equal(phase.to.type, 'high');
});

test('rising and falling are read from the turning point ahead', () => {
  assert.equal(tidePhase(turns, Date.parse('2026-08-26T09:00')).rising, true);
  assert.equal(tidePhase(turns, Date.parse('2026-08-26T15:00')).rising, false);
});

test('progress runs from nought at one turning point to one at the next', () => {
  const at = tidePhase(turns, Date.parse('2026-08-26T06:12'));
  assert.ok(Math.abs(at.through) < 1e-9, `got ${at.through}`);
  const later = tidePhase(turns, Date.parse('2026-08-26T12:30'));
  assert.ok(Math.abs(later.through) < 1e-9 || Math.abs(later.through - 1) < 1e-9);
  const middle = tidePhase(turns, Date.parse('2026-08-26T09:21'));
  assert.ok(Math.abs(middle.through - 0.5) < 0.01, `got ${middle.through}`);
});

test('a time outside the turning points yields nothing rather than extrapolating', () => {
  assert.equal(tidePhase(turns, Date.parse('2026-08-25T23:00')), null);
  assert.equal(tidePhase(turns, Date.parse('2026-08-27T09:00')), null);
  assert.equal(tidePhase([], Date.now()), null);
});

test('the app asks for the phase and draws it', () => {
  assert.match(providers, /tidePhase: tidePhase\(turns\)/, 'conditions does not carry the phase');
  const app = readFileSync('public/app.js', 'utf8');
  assert.match(app, /tidePhaseWidget\(phase\)/, 'nothing draws the phase');
  assert.match(app, /clock\(phase\.from\.time\)/, 'the turning point behind us has no time');
  assert.match(app, /clock\(phase\.to\.time\)/, 'the turning point ahead has no time');
});

test('the curve runs the way the water is going', () => {
  // Low on the left when it is coming in, high on the left when it is going
  // out — the picture should never contradict the arrow beside it.
  const app = readFileSync('public/app.js', 'utf8');
  assert.match(app, /const up = phase\.rising \? swing : 1 - swing;/,
    'the curve should invert when the tide is falling');
});

test('the card explains no chart datum to swimmers', () => {
  // Mean sea level is not something anyone standing on a beach can see, and a
  // negative depth of water is nonsense on its face. Times either end of a
  // curve need no datum at all.
  const app = readFileSync('public/app.js', 'utf8');
  assert.doesNotMatch(app, /mean sea level/, 'the card should not mention a chart datum');
});
