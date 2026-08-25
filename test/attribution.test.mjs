// Attribution is a licence condition, not decoration.
//
// OGL v3, CC-BY 4.0 and ODbL each require the source to be credited in the
// running application, not merely in a file in the repository. It was lost once
// already, when the credits panel was removed along with the info button, so it
// is pinned here rather than trusted.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { style } from '../site/map-style.js';

const spots = JSON.parse(readFileSync('site/data/bathing.json', 'utf8'));
const buoys = JSON.parse(readFileSync('site/data/buoys.json', 'utf8'));
const built = style(spots.spots, buoys.stations);
const app = readFileSync('site/app.js', 'utf8');
const css = readFileSync('site/style.css', 'utf8');

test('every data source carries an attribution', () => {
  for (const [name, source] of Object.entries(built.sources)) {
    // The selection ring is our own drawing, not somebody's data.
    if (name === 'selected') continue;
    assert.ok(source.attribution, `source "${name}" credits nobody`);
  }
});

test('the coastline credits OpenStreetMap, as ODbL requires', () => {
  assert.match(built.sources.land.attribution, /OpenStreetMap/);
});

test('the public sector sources name their licence', () => {
  assert.match(built.sources.spots.attribution, /Environment Agency/);
  assert.match(built.sources.spots.attribution, /OGL/);
  assert.match(built.sources.buoys.attribution, /OGL/);
});

test('Open-Meteo gets the exact wording its licence asks for', () => {
  // The licence page specifies this string, as a link.
  assert.match(app, /Weather data by Open-Meteo\.com/);
  assert.match(app, /https:\/\/open-meteo\.com\//);
});

test('the attribution control is added to the map', () => {
  assert.match(app, /new AttributionControl\(/);
});

test('the attribution control is not hidden by stylesheet', () => {
  // It used to be suppressed with `display: none`, which is how the notices
  // disappeared from the running app while remaining in the repository.
  assert.doesNotMatch(css, /\.maplibregl-ctrl-attrib[^{]*\{[^}]*display:\s*none/);
});
