// Stepping along the coast, one spot at a time.
//
// The hard part is that left and right cannot mean west and east. Sussex runs
// east to west and Yorkshire runs north to south, so direction is taken from
// the local run of the coastline rather than from the compass. These tests pin
// that against real geography: if a walk stops matching the map, the axis
// estimate has drifted.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { adjacent } from '../site/providers.js';

const { spots } = JSON.parse(readFileSync('site/data/bathing.json', 'utf8'));
const find = (name) => {
  const spot = spots.find((s) => s.name === name);
  assert.ok(spot, `no spot named ${name}`);
  return spot;
};

/** Names visited stepping `steps` times in one direction. */
const walk = (from, direction, steps = 4) => {
  const seen = [];
  let cursor = from;
  for (let i = 0; i < steps; i += 1) {
    cursor = adjacent(cursor, spots, direction);
    if (!cursor) break;
    seen.push(cursor.name);
  }
  return seen;
};

test('an east-west coast is walked in order: Sussex, eastward', () => {
  assert.deepEqual(walk(find('Brighton Central'), 1), [
    'Brighton Kemptown', 'Rottingdean Beach', 'Saltdean', 'Seaford',
  ]);
});

test('an east-west coast is walked in order: Sussex, westward', () => {
  assert.deepEqual(walk(find('Brighton Central'), -1), [
    'Hove', 'Southwick', 'Shoreham Beach', 'Lancing, Beach Green',
  ]);
});

test('a north-south coast works too: Yorkshire, southward', () => {
  assert.deepEqual(walk(find('Scarborough South Bay'), 1), [
    'Cayton Bay', 'Filey', 'Reighton', 'Danes Dyke, Flamborough',
  ]);
});

test('a north-south coast works too: Yorkshire, northward', () => {
  assert.deepEqual(walk(find('Scarborough South Bay'), -1), [
    'Scarborough North Bay', 'Robin Hoods Bay', 'Whitby', 'Sandsend',
  ]);
});

test('the two directions are opposites', () => {
  for (const name of ['Brighton Central', 'Scarborough South Bay', 'Bournemouth Pier']) {
    const from = find(name);
    const forward = adjacent(from, spots, 1);
    if (!forward) continue;
    const back = adjacent(forward, spots, -1);
    assert.equal(back?.name, name, `${name} → ${forward.name} did not step back`);
  }
});

test('a step never returns the spot it started from', () => {
  for (const spot of spots.slice(0, 60)) {
    for (const direction of [1, -1]) {
      const next = adjacent(spot, spots, direction);
      if (next) assert.notEqual(next.name, spot.name);
    }
  }
});

test('every spot can be stepped away from in at least one direction', () => {
  const stranded = spots.filter(
    (s) => !adjacent(s, spots, 1) && !adjacent(s, spots, -1)
  );
  assert.deepEqual(stranded.map((s) => s.name), []);
});

test('a lone spot has nowhere to go rather than throwing', () => {
  const [only] = spots;
  assert.equal(adjacent(only, [only], 1), null);
});

test('steps stay local rather than leaping across the country', () => {
  // A bad axis estimate shows up as a jump to a different coast entirely.
  const from = find('Brighton Central');
  const next = adjacent(from, spots, 1);
  const km = Math.hypot(
    (next.lon - from.lon) * 111.32 * Math.cos((from.lat * Math.PI) / 180),
    (next.lat - from.lat) * 111.32
  );
  assert.ok(km < 25, `stepped ${km.toFixed(1)} km, which is not adjacent`);
});
