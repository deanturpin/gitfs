// Wind direction, gusts and wave period.
//
// The readings were all being fetched and none of them used. These pin the
// behaviour that came out of local knowledge: an offshore wind flattens the
// water, which is pleasant until it is strong enough to take you with it, and
// half a metre of ground swell is not half a metre of chop.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { verdict, offshoreness } from '../site/verdict.js';
import { OFFSHORE_VETO_WIND_MPH } from '../site/thresholds.js';

// A beach facing south has its land to the north.
const SOUTH_FACING = 180;

const day = (over) => ({
  seaTemp: 17, waveHeight: 0.4, wavePeriod: 4,
  windSpeed: 10, windGust: 14, feelsLike: 16,
  classification: 'Excellent', risk: 'normal',
  aspect: SOUTH_FACING, windDirection: SOUTH_FACING,
  ...over,
});

test('a wind off the land reads as fully offshore', () => {
  assert.equal(offshoreness(0, SOUTH_FACING).toFixed(2), '1.00');
});

test('a wind off the sea reads as fully onshore', () => {
  assert.equal(offshoreness(180, SOUTH_FACING).toFixed(2), '-1.00');
});

test('a wind along the beach reads as neither', () => {
  assert.equal(Math.abs(offshoreness(90, SOUTH_FACING)) < 1e-9, true);
});

test('it works for a beach facing any way', () => {
  for (const aspect of [0, 45, 90, 180, 270, 359]) {
    const offLand = (aspect + 180) % 360;
    assert.ok(offshoreness(offLand, aspect) > 0.99, `aspect ${aspect}`);
    assert.ok(offshoreness(aspect, aspect) < -0.99, `aspect ${aspect}`);
  }
});

test('an unknown aspect yields nothing rather than a guess', () => {
  // 47 of the catalogue's spots are inland waters with no coastline to face.
  assert.equal(offshoreness(180, null), null);
  assert.equal(offshoreness(null, 180), null);
});

test('a strong offshore wind is a veto, however nice it looks', () => {
  // It flattens the water, which is exactly what makes it dangerous: the one
  // condition here that is worse for looking better.
  const call = verdict(day({ windDirection: 0, windSpeed: 30, windGust: 38 }));
  assert.equal(call.label, 'FUCK NO');
  assert.equal(call.because, 'blown offshore');
});

test('the same wind blowing onshore is unpleasant, not forbidden', () => {
  const call = verdict(day({ windDirection: 180, windSpeed: 30, windGust: 38 }));
  assert.notEqual(call.because, 'blown offshore');
  assert.notEqual(call.label, 'FUCK NO');
});

test('a gentle offshore breeze is not penalised', () => {
  const gentle = verdict(day({ windDirection: 0, windSpeed: 7 }));
  const onshore = verdict(day({ windDirection: 180, windSpeed: 7 }));
  assert.ok(gentle.score >= onshore.score, 'a light offshore day should not score worse');
});

test('ground swell counts for more than chop at the same height', () => {
  const chop = verdict(day({ waveHeight: 0.6, wavePeriod: 4 }));
  const swell = verdict(day({ waveHeight: 0.6, wavePeriod: 11 }));
  assert.ok(swell.score < chop.score, `swell ${swell.score} should score below chop ${chop.score}`);
});

test('gusts count, not just the mean', () => {
  const steady = verdict(day({ windSpeed: 12, windGust: 13 }));
  const gusty = verdict(day({ windSpeed: 12, windGust: 34 }));
  assert.ok(gusty.score < steady.score, 'a gusty day should score below a steady one');
});

test('missing direction or period changes nothing else', () => {
  // Most of the sea has no aspect derived and every reading can be absent.
  const call = verdict(day({ aspect: null, windDirection: null, wavePeriod: null }));
  assert.ok(call.score > 0, 'should still produce a verdict');
  assert.notEqual(call.label, 'FUCK NO');
});

// ---------------------------------------------------------------------------
// Where an offshore wind stops being pleasant
// ---------------------------------------------------------------------------

test('sixteen miles an hour offshore is a pause, not a yes', () => {
  // A local swimmer's number: that is where they start weighing it up. The
  // veto used to sit at 28, which is a near gale — by then it has answered
  // itself and everything below it read as fine.
  const call = verdict(day({ windDirection: 0, windSpeed: 16, windGust: 20 }));
  assert.ok(['HMMM', 'FUCK NO'].includes(call.label), `sixteen offshore scored ${call.label}`);
});

test('the same wind onshore scores better than offshore', () => {
  // The whole point of knowing which way the beach faces. Identical speed,
  // opposite meaning.
  const offshore = verdict(day({ windDirection: 0, windSpeed: 16, windGust: 20 }));
  const onshore = verdict(day({ windDirection: 180, windSpeed: 16, windGust: 20 }));
  assert.ok(onshore.score > offshore.score, `onshore ${onshore.score} should beat offshore ${offshore.score}`);
});

test('a light offshore wind is still a good day', () => {
  // It must not tip into caution so early that a pleasant flat morning is
  // marked down for having any offshore component at all.
  const call = verdict(day({ windDirection: 0, windSpeed: 8, windGust: 10 }));
  assert.equal(call.label, 'HELL YEAH');
});

test('the veto fires at the threshold and not before', () => {
  const under = verdict(day({ windDirection: 0, windSpeed: OFFSHORE_VETO_WIND_MPH - 1 }));
  const at = verdict(day({ windDirection: 0, windSpeed: OFFSHORE_VETO_WIND_MPH }));
  assert.notEqual(under.because, 'blown offshore');
  assert.equal(at.because, 'blown offshore');
});

test('drift worsens steadily as an offshore wind builds', () => {
  let previous = 1;
  for (let speed = 6; speed <= 19; speed += 1) {
    const { score } = verdict(day({ windDirection: 0, windSpeed: speed, windGust: speed + 4 }));
    assert.ok(score <= previous + 1e-9, `${speed} mph scored above a lighter wind`);
    previous = score;
  }
});
