// Finding the closest swim spot to a position.
//
// The distance matters as much as the match: someone well inland is still
// entitled to an answer, and the app must say how far it is rather than
// implying the sea is at the end of their road.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { nearest, distanceKm } from '../site/providers.js';

const { spots } = JSON.parse(readFileSync('site/data/bathing.json', 'utf8'));

const BRIGHTON = { lat: 50.8198, lon: -0.1372 };
const BIRMINGHAM = { lat: 52.4862, lon: -1.8904 };
const JOHN_O_GROATS = { lat: 58.6373, lon: -3.0689 };

test('from Brighton seafront the nearest spot is a Brighton beach', () => {
  const { spot, km } = nearest(BRIGHTON, spots);
  assert.match(spot.name, /Brighton|Hove/);
  assert.ok(km < 3, `expected a beach within 3 km, got ${km.toFixed(1)} km`);
});

test('from Birmingham it still answers, and says how far', () => {
  // The old implementation capped at 30 km and silently did nothing here.
  const { spot, km } = nearest(BIRMINGHAM, spots);
  assert.ok(spot, 'no spot returned for an inland position');
  assert.ok(km > 20, `expected well away from the sea, got ${km.toFixed(1)} km`);
});

test('the catalogue includes inland waters, not only the sea', () => {
  // The Environment Agency designates rivers and lakes too, so the nearest
  // spot to the Midlands is the Severn rather than a beach. Those sites are
  // real, but the marine model cannot describe them — see marineApplies.
  const { spot } = nearest(BIRMINGHAM, spots);
  assert.match(spot.name, /River|Lake|Water|Park/);
});

test('the nearest really is the nearest', () => {
  for (const from of [BRIGHTON, BIRMINGHAM, JOHN_O_GROATS]) {
    const { km } = nearest(from, spots);
    const truth = Math.min(...spots.map((s) => distanceKm(from, s)));
    assert.ok(Math.abs(km - truth) < 1e-9, `${km} is not the minimum ${truth}`);
  }
});

test('an empty catalogue returns nothing rather than throwing', () => {
  assert.equal(nearest(BRIGHTON, []), null);
});

test('distance is symmetric and zero to itself', () => {
  assert.equal(distanceKm(BRIGHTON, BRIGHTON), 0);
  const there = distanceKm(BRIGHTON, BIRMINGHAM);
  const back = distanceKm(BIRMINGHAM, BRIGHTON);
  assert.ok(Math.abs(there - back) < 1e-9);
});

test('a known distance is roughly right', () => {
  // Brighton to Birmingham is about 220 km as the crow flies.
  const km = distanceKm(BRIGHTON, BIRMINGHAM);
  assert.ok(km > 200 && km < 240, `got ${km.toFixed(0)} km`);
});
