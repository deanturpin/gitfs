// Validates the map style against the MapLibre specification.
//
// A layer naming a source that does not exist, or a malformed expression, does
// not throw — MapLibre logs and carries on, drawing nothing. On a map of the
// sea that is indistinguishable from a working map of open water, and headless
// Chrome has no WebGL, so a screenshot cannot tell the difference either.
// This can.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { validateStyleMin } from '@maplibre/maplibre-gl-style-spec';
import { style, points, CLASSIFICATION, VERDICT_COLOUR } from '../site/map-style.js';

const spots = JSON.parse(readFileSync('site/data/bathing.json', 'utf8'));
const buoys = JSON.parse(readFileSync('site/data/buoys.json', 'utf8'));

test('style validates against the MapLibre specification', () => {
  const errors = validateStyleMin(style(spots.spots, buoys.stations));
  assert.deepEqual(errors.map((e) => `${e.line ?? '?'}: ${e.message}`), []);
});

test('every layer names a source that exists', () => {
  const built = style(spots.spots, buoys.stations);
  for (const layer of built.layers) {
    if (layer.type === 'background') continue;
    assert.ok(built.sources[layer.source], `layer ${layer.id} wants missing source ${layer.source}`);
  }
});

test('points carry coordinates in longitude, latitude order', () => {
  // Reversed coordinates put Britain in Somalia and the map looks empty.
  const [feature] = points([{ lat: 50.82, lon: -0.14, name: 'Brighton Central' }]).features;
  assert.deepEqual(feature.geometry.coordinates, [-0.14, 50.82]);
});

test('every spot sits within plausible bounds for these islands', () => {
  const stray = spots.spots.filter(
    (s) => s.lat < 49 || s.lat > 61 || s.lon < -11 || s.lon > 2.5
  );
  assert.deepEqual(stray.map((s) => s.name), []);
});

test('classification colours cover the values the data actually uses', () => {
  const used = new Set(spots.spots.map((s) => s.classification).filter(Boolean));
  const unknown = [...used].filter((c) => !(c in CLASSIFICATION));
  assert.deepEqual(unknown, [], `unstyled classifications fall back to grey: ${unknown}`);
});

test('buoy readings are numbers or null, never strings', () => {
  // The scraper parses '-' into null; a string here means a column moved.
  const bad = buoys.stations.filter(
    (s) => s.seaTemp !== null && typeof s.seaTemp !== 'number'
  );
  assert.deepEqual(bad.map((s) => s.name), []);
});

test('the selection ring is drawn beneath the spots it rings', () => {
  // Above them it would cover the classification colour, which is the one
  // thing the marker exists to convey.
  const built = style(spots.spots, buoys.stations);
  const order = built.layers.map((l) => l.id);
  assert.ok(order.indexOf('selected') < order.indexOf('spots'), order.join(' < '));
});

test('nothing is selected until something is', () => {
  const built = style(spots.spots, buoys.stations);
  assert.deepEqual(built.sources.selected.data.features, []);
});

test('the classification colours the panel text as well as the marker', () => {
  // The status text and its dot on the map must not disagree about a beach.
  const used = new Set(spots.spots.map((s) => s.classification).filter(Boolean));
  for (const grade of used) {
    assert.ok(CLASSIFICATION[grade], `${grade} has no colour, so the text falls back and the marker does not`);
  }
});

test('every verdict tone has a colour for the map ring', () => {
  // The ring and the headline describe the same judgement, so a tone with no
  // colour would leave them disagreeing.
  for (const tone of ['yes', 'good', 'hmm', 'no']) {
    assert.match(VERDICT_COLOUR[tone] ?? '', /^#[0-9a-f]{6}$/i, `tone "${tone}" has no colour`);
  }
});

test('the verdict palette matches the stylesheet', () => {
  // Two copies of a colour is one too many; if they drift, the map and the
  // card say different things about the same spot.
  const css = readFileSync('site/style.css', 'utf8');
  for (const [tone, colour] of Object.entries(VERDICT_COLOUR)) {
    const rule = new RegExp(`\\.verdict\\[data-tone="${tone}"\\]\\s*\\{\\s*color:\\s*${colour}`, 'i');
    assert.match(css, rule, `.verdict[data-tone="${tone}"] does not use ${colour}`);
  }
});

test('the title and the verdict are set at the same size', () => {
  // The question and the answer are the two loudest things in the app. They
  // drift apart the moment one is adjusted without the other.
  const css = readFileSync('site/style.css', 'utf8');
  const sizes = [...css.matchAll(/font-size:\s*(clamp\([^)]*\))/g)].map((m) => m[1]);
  const title = css.match(/#banner h1 \{[^}]*font-size:\s*(clamp\([^)]*\))/s)?.[1];
  const verdict = css.match(/\.verdict \{[^}]*font-size:\s*(clamp\([^)]*\))/s)?.[1];
  assert.ok(title, 'no clamped size found for the title');
  assert.ok(verdict, 'no clamped size found for the verdict');
  assert.equal(title, verdict);
  assert.ok(sizes.length >= 2);
});
