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
import { style, points, bobbing, BUOY_ICONS, CLASSIFICATION, VERDICT_COLOUR } from '../site/map-style.js';

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

test('every buoy is given one of the drawn variants', () => {
  const { features } = bobbing(buoys.stations);
  assert.equal(features.length, buoys.stations.length);
  for (const { properties } of features) {
    assert.ok(
      BUOY_ICONS.includes(properties.buoyIcon),
      `${properties.name} asks for "${properties.buoyIcon}"`
    );
  }
});

test('a buoy keeps the same variant between builds', () => {
  // Chosen from the station id, not randomly, so regenerating the readings
  // every half hour does not tip every buoy to a new angle.
  const first = bobbing(buoys.stations).features.map((f) => f.properties.buoyIcon);
  const again = bobbing(buoys.stations).features.map((f) => f.properties.buoyIcon);
  assert.deepEqual(first, again);
});

test('the variants are spread across the buoys', () => {
  // The point is to look like floating rather than printing. Station ids differ
  // by a digit or two, so a weak hash buckets them together — an earlier one
  // put three buoys in four at the same angle.
  const used = bobbing(buoys.stations).features.map((f) => f.properties.buoyIcon);
  const fair = used.length / BUOY_ICONS.length;
  for (const icon of BUOY_ICONS) {
    const count = used.filter((u) => u === icon).length;
    assert.ok(count > fair * 0.4, `${icon} used only ${count} times of ${used.length}`);
  }
});

test('the buoy leans but its water does not', () => {
  // A tilted waterline is why the lean is baked into the artwork rather than
  // applied by rotating the finished icon. The rotation must not wrap the waves.
  const app = readFileSync('site/app.js', 'utf8');
  const rotated = app.match(/<g transform="rotate\(\$\{lean\}[^"]*">([\s\S]*?)<\/g>/)?.[1] ?? '';
  assert.ok(rotated.includes('circle'), 'the buoy itself should sit inside the rotation');
  assert.ok(!rotated.includes('opacity'), 'the waves should sit outside the rotation');
  const style = readFileSync('site/map-style.js', 'utf8');
  assert.doesNotMatch(style, /'icon-rotate'/, 'rotating the icon would tip the sea over');
});

test('the buoy icon is drawn in one colour, like the rest', () => {
  const app = readFileSync('site/app.js', 'utf8');
  const svg = app.match(/<svg xmlns[^`]*<\/svg>/s)?.[0] ?? '';
  assert.ok(svg, 'no buoy artwork found');
  const colours = new Set([...svg.matchAll(/#[0-9a-f]{6}/gi)].map((m) => m[0].toLowerCase()));
  assert.equal(colours.size, 1, `buoy uses ${colours.size} colours: ${[...colours].join(', ')}`);
});

test('the shipped catalogue knows which way the beaches face', () => {
  // fetch_bathing.py rewrites this file from the API, which has no such field,
  // so a successful refresh drops it. shore_aspect.py has to run afterwards,
  // in the Makefile and in the workflow. If that ordering is ever lost this is
  // what notices — the failure is otherwise silent, and wind direction simply
  // stops being taken into account.
  const withAspect = spots.spots.filter((s) => typeof s.aspect === 'number');
  assert.ok(
    withAspect.length > spots.spots.length * 0.8,
    `only ${withAspect.length} of ${spots.spots.length} spots have an aspect`
  );
});

test('every derived aspect is a compass bearing', () => {
  for (const spot of spots.spots) {
    if (spot.aspect === null || spot.aspect === undefined) continue;
    assert.ok(spot.aspect >= 0 && spot.aspect < 360, `${spot.name}: ${spot.aspect}`);
  }
});

test('the spots without an aspect are the ones with no coast', () => {
  // Inland bathing waters — lakes and rivers — have no shoreline to face.
  const without = spots.spots.filter((s) => s.aspect === null || s.aspect === undefined);
  assert.ok(without.length < 60, `${without.length} spots have no aspect`);
});
