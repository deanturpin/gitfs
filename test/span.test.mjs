// The box that says "show me ten kilometres of coast".
//
// Asking for a span rather than a zoom is the point: a fixed zoom level is a
// scale per pixel, so it covers roughly 6 km on a phone and 20 km on a desktop.
// These check the box really is the width asked for, at any latitude the app
// covers, so fitBounds is being handed the right thing.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spanBounds, distanceKm } from '../site/providers.js';

const BRIGHTON = { lat: 50.8198, lon: -0.1372 };
const SHETLAND = { lat: 60.15, lon: -1.15 };
const SCILLY = { lat: 49.93, lon: -6.32 };

/** Width of the box on the ground, in km, along its own latitude. */
const widthKm = (spot, metres) => {
  const [[west], [east]] = spanBounds(spot, metres);
  return distanceKm({ lat: spot.lat, lon: west }, { lat: spot.lat, lon: east });
};

test('ten kilometres wide is ten kilometres wide', () => {
  assert.ok(Math.abs(widthKm(BRIGHTON, 10_000) - 10) < 0.1, widthKm(BRIGHTON, 10_000));
});

test('the width holds from the Scillies to Shetland', () => {
  // Longitude narrows towards the pole, so a fixed offset in degrees would be
  // 40% out across the range this app covers.
  for (const spot of [SCILLY, BRIGHTON, SHETLAND]) {
    const km = widthKm(spot, 10_000);
    assert.ok(Math.abs(km - 10) < 0.15, `${spot.lat}: ${km.toFixed(2)} km`);
  }
});

test('the box scales with what is asked for', () => {
  for (const metres of [2_000, 10_000, 50_000]) {
    const km = widthKm(BRIGHTON, metres);
    assert.ok(Math.abs(km - metres / 1000) < metres / 1000 * 0.02, `${metres}: ${km}`);
  }
});

test('the box is centred on the spot', () => {
  const [[west, south], [east, north]] = spanBounds(BRIGHTON, 10_000);
  assert.ok(Math.abs((west + east) / 2 - BRIGHTON.lon) < 1e-9);
  assert.ok(Math.abs((south + north) / 2 - BRIGHTON.lat) < 1e-9);
});

test('the box is wider than it is tall', () => {
  // On a tall map the width has to be what constrains the fit, or a phone would
  // zoom in far past the span that was asked for.
  const [[west, south], [east, north]] = spanBounds(BRIGHTON, 10_000);
  const across = distanceKm({ lat: BRIGHTON.lat, lon: west }, { lat: BRIGHTON.lat, lon: east });
  const up = distanceKm({ lat: south, lon: BRIGHTON.lon }, { lat: north, lon: BRIGHTON.lon });
  assert.ok(across > up * 2, `${across.toFixed(1)} km across vs ${up.toFixed(1)} km up`);
});

test('the corners come back in the order fitBounds expects', () => {
  const [[west, south], [east, north]] = spanBounds(BRIGHTON, 10_000);
  assert.ok(west < east, 'south-west corner first');
  assert.ok(south < north, 'south-west corner first');
});
