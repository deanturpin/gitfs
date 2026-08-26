// The criteria for getting in the sea, as a reviewable table.
//
// This file is the specification. If you disagree with a call the app makes,
// the argument belongs here first: change the expectation, watch it fail, then
// change the curve in verdict.js until it passes. The weights and curves are
// opinions about swimming, not facts about physics, and they should be easy to
// argue with.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { verdict, PERSONAS, VERDICTS } from '../site/verdict.js';
import {
  HELL_YEAH_AT, HMMM_AT, MAX_WAVE_HEIGHT_M, MIN_SEA_TEMP_C, YEAH_AT,
} from '../site/thresholds.js';

/** A day at the seaside, described the way a swimmer would describe it. */
const day = (over) => ({
  seaTemp: 17,
  waveHeight: 0.4,
  windSpeed: 10,
  feelsLike: 16,
  classification: 'Excellent',
  risk: 'normal',
  ...over,
});

// ---------------------------------------------------------------------------
// The headline calls
// ---------------------------------------------------------------------------

const SCENARIOS = [
  // name                     conditions                                        expected
  ['warm calm summer day',    {},                                                'HELL YEAH'],
  ['Brighton, late August',   { seaTemp: 20.5, waveHeight: 0.64, windSpeed: 11, feelsLike: 19, classification: 'Good' }, 'HELL YEAH'],
  ['chilly but flat',         { seaTemp: 12, feelsLike: 12 },                    'YEAH'],
  ['midwinter, brisk wind',   { seaTemp: 7, windSpeed: 22, feelsLike: 3 },       'HMMM'],
  ['ice swim territory',      { seaTemp: 4, feelsLike: 2 },                      'FUCK NO'],
  ['choppy but warm',         { seaTemp: 19, waveHeight: 1.2, windSpeed: 20 },   'HMMM'],
  ['storm',                   { waveHeight: 2.2, windSpeed: 35 },                'FUCK NO'],
  ['warm sea, filthy water',  { seaTemp: 21, classification: 'Poor' },           'HMMM'],
  ['sewage forecast',         { risk: 'increased' },                             'FUCK NO'],
  ['beach closed',            { classification: 'Closed' },                      'FUCK NO'],
  ['lovely, but blowing',     { seaTemp: 18, windSpeed: 32, feelsLike: 9 },      'HMMM'],
];

for (const [name, conditions, expected] of SCENARIOS) {
  test(`${name} → ${expected}`, () => {
    assert.equal(verdict(day(conditions)).label, expected);
  });
}

// ---------------------------------------------------------------------------
// Vetoes: conditions that settle it alone, whatever the average says
// ---------------------------------------------------------------------------

test('a pollution risk overrides otherwise perfect conditions', () => {
  const perfect = day({ seaTemp: 22, waveHeight: 0.1, windSpeed: 3, feelsLike: 24 });
  assert.equal(verdict(perfect).label, 'HELL YEAH');
  assert.equal(verdict({ ...perfect, risk: 'increased' }).label, 'FUCK NO');
});

test('a closed beach overrides everything', () => {
  assert.equal(verdict(day({ classification: 'Closed', seaTemp: 23 })).label, 'FUCK NO');
});

test('vetoes explain themselves', () => {
  assert.equal(verdict(day({ risk: 'increased' })).because, 'pollution risk');
  assert.equal(verdict(day({ waveHeight: 2 })).because, 'too rough');
  assert.equal(verdict(day({ seaTemp: 3 })).because, 'dangerously cold');
  assert.equal(verdict(day({ classification: 'Closed' })).because, 'closed');
});

test('the veto thresholds sit where the constants say they do', () => {
  // Written against the named constants rather than repeating the numbers, so
  // changing a threshold in thresholds.js moves the test with it instead of
  // leaving two places disagreeing about what the rule is.
  assert.notEqual(verdict(day({ waveHeight: MAX_WAVE_HEIGHT_M })).because, 'too rough');
  assert.equal(verdict(day({ waveHeight: MAX_WAVE_HEIGHT_M + 0.01 })).because, 'too rough');
  assert.notEqual(verdict(day({ seaTemp: MIN_SEA_TEMP_C })).because, 'dangerously cold');
  assert.equal(verdict(day({ seaTemp: MIN_SEA_TEMP_C - 0.1 })).because, 'dangerously cold');
});

test('the bands are in order and inside the scale', () => {
  // A threshold file makes these easy to mistype into nonsense.
  assert.ok(HELL_YEAH_AT > YEAH_AT, 'HELL YEAH must need a better score than YEAH');
  assert.ok(YEAH_AT > HMMM_AT, 'YEAH must need a better score than HMMM');
  for (const at of [HELL_YEAH_AT, YEAH_AT, HMMM_AT]) {
    assert.ok(at > 0 && at < 1, `${at} is outside the nought to one scale`);
  }
});

// ---------------------------------------------------------------------------
// Properties that must hold whatever the curves say
// ---------------------------------------------------------------------------

test('colder sea is never a better swim', () => {
  let previous = 1;
  for (let t = 24; t >= 6; t -= 0.5) {
    const { score } = verdict(day({ seaTemp: t }));
    assert.ok(score <= previous + 1e-9, `${t} °C scored above a warmer sea`);
    previous = score;
  }
});

test('bigger waves are never a better swim', () => {
  let previous = 1;
  for (let h = 0; h <= 1.5; h += 0.1) {
    const { score } = verdict(day({ waveHeight: h }));
    assert.ok(score <= previous + 1e-9, `${h} m scored above a calmer sea`);
    previous = score;
  }
});

test('more wind is never a better swim', () => {
  let previous = 1;
  for (let w = 0; w <= 40; w += 2) {
    const { score } = verdict(day({ windSpeed: w }));
    assert.ok(score <= previous + 1e-9, `${w} mph scored above a calmer day`);
    previous = score;
  }
});

test('worse water quality is never a better swim', () => {
  const grades = ['Excellent', 'Good', 'Sufficient', 'Poor'];
  const scores = grades.map((g) => verdict(day({ classification: g })).score);
  assert.deepEqual(scores, [...scores].sort((a, b) => b - a), grades.join(' > '));
});

test('every score lands between 0 and 1', () => {
  for (const [, conditions] of SCENARIOS) {
    const { score } = verdict(day(conditions));
    if (score === null) continue;
    assert.ok(score >= 0 && score <= 1, `score ${score} out of range`);
  }
});

// ---------------------------------------------------------------------------
// Missing readings must not masquerade as good ones
// ---------------------------------------------------------------------------

test('a missing reading is not scored as zero', () => {
  // Otherwise a quiet buoy would read as freezing water.
  const withWaves = verdict(day({ waveHeight: 0.4 })).score;
  const without = verdict(day({ waveHeight: null })).score;
  assert.ok(Math.abs(withWaves - without) < 0.15, 'a missing wave height moved the score too far');
});

test('losing the dominant reading caps confidence', () => {
  // Sea temperature carries the most weight. Without it, a high average is an
  // opinion formed from whatever happened to be available.
  const call = verdict({
    seaTemp: null, waveHeight: null, windSpeed: 9, feelsLike: 17,
    classification: 'Excellent', risk: 'normal',
  });
  assert.equal(call.label, 'HMMM');
  assert.equal(call.because, 'not enough readings');
});

test('no readings at all is never a yes', () => {
  const call = verdict({
    seaTemp: null, waveHeight: null, windSpeed: null,
    feelsLike: null, classification: null, risk: null,
  });
  assert.notEqual(call.label, VERDICTS.yes.label);
  assert.equal(call.score, null);
});

// ---------------------------------------------------------------------------
// The weighting table itself
// ---------------------------------------------------------------------------

test('swim weights sum to one', () => {
  const total = Object.values(PERSONAS.swim).reduce((a, b) => a + b, 0);
  assert.ok(Math.abs(total - 1) < 1e-9, `weights sum to ${total}`);
});

test('sea temperature carries the most weight for a swimmer', () => {
  const [heaviest] = Object.entries(PERSONAS.swim).sort((a, b) => b[1] - a[1]);
  assert.equal(heaviest[0], 'seaTemp');
});

test('an unknown classification is treated as middling, not perfect', () => {
  const unknown = verdict(day({ classification: 'Nonsense' })).score;
  const excellent = verdict(day({ classification: 'Excellent' })).score;
  assert.ok(unknown < excellent, 'an unrecognised grade must not score as Excellent');
});

// ---------------------------------------------------------------------------
// The ladder itself
// ---------------------------------------------------------------------------

test('all four verdicts are reachable', () => {
  const reached = new Set(SCENARIOS.map(([, c]) => verdict(day(c)).label));
  assert.deepEqual(
    [...reached].sort(),
    ['FUCK NO', 'HELL YEAH', 'HMMM', 'YEAH'],
    'a band no scenario reaches is a band nobody will ever see'
  );
});

test('the ladder runs in order, best to worst', () => {
  const ladder = [
    day({ seaTemp: 22, waveHeight: 0.1, windSpeed: 3, feelsLike: 24 }),
    day({ seaTemp: 14, feelsLike: 14 }),
    day({ seaTemp: 9, windSpeed: 20, feelsLike: 6 }),
    day({ seaTemp: 6.5, windSpeed: 38, feelsLike: 1 }),
  ];
  const labels = ladder.map((c) => verdict(c).label);
  assert.deepEqual(labels, ['HELL YEAH', 'YEAH', 'HMMM', 'FUCK NO']);

  const scores = ladder.map((c) => verdict(c).score);
  assert.deepEqual(scores, [...scores].sort((a, b) => b - a), 'scores must fall as the verdicts worsen');
});

// ---------------------------------------------------------------------------
// The percentage
// ---------------------------------------------------------------------------

test('the percentage is the score, rounded', () => {
  for (const [, conditions] of SCENARIOS) {
    const { score, percent } = verdict(day(conditions));
    if (percent === null) continue;
    assert.equal(percent, Math.round(score * 100));
  }
});

test('percentages stay between 0 and 100', () => {
  for (const [, conditions] of SCENARIOS) {
    const { percent } = verdict(day(conditions));
    if (percent === null) continue;
    assert.ok(percent >= 0 && percent <= 100, `got ${percent}`);
  }
});

test('a veto reads zero rather than blank', () => {
  // A shut beach is a genuine nought, not a missing reading.
  assert.equal(verdict(day({ classification: 'Closed' })).percent, 0);
  assert.equal(verdict(day({ risk: 'increased' })).percent, 0);
});

test('thin readings withhold the percentage', () => {
  // Otherwise the headline argues with itself: 90% beside HMMM.
  const call = verdict({
    seaTemp: null, waveHeight: null, windSpeed: 9, feelsLike: 17,
    classification: 'Excellent', risk: 'normal',
  });
  assert.equal(call.label, 'HMMM');
  assert.equal(call.percent, null);
});

test('no readings at all has no percentage', () => {
  const call = verdict({
    seaTemp: null, waveHeight: null, windSpeed: null,
    feelsLike: null, classification: null, risk: null,
  });
  assert.equal(call.percent, null);
});

test('a better percentage never carries a worse verdict', () => {
  const rank = { 'FUCK NO': 0, HMMM: 1, YEAH: 2, 'HELL YEAH': 3 };
  const rated = SCENARIOS
    .map(([, c]) => verdict(day(c)))
    .filter((v) => v.percent !== null)
    .sort((a, b) => a.percent - b.percent);
  for (let i = 1; i < rated.length; i += 1) {
    assert.ok(
      rank[rated[i].label] >= rank[rated[i - 1].label],
      `${rated[i].percent}% is ${rated[i].label} but ${rated[i - 1].percent}% is ${rated[i - 1].label}`
    );
  }
});
