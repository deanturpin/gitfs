// What the readings mean.
//
// This file is the physical half of the judgement: it turns raw numbers into
// how good or bad each one is for a swimmer, on a scale of nought to one. It
// holds no opinion about how the factors trade off against each other — that is
// verdict.js, which weighs them and picks a word.
//
import { CHOP_PERIOD_S, DRIFT_WIND_FLOOR_MPH } from './thresholds.js';

// Everything here is a pure function of readings, which is why the curves can
// be argued with directly. If you think 12 °C scores too generously, this is
// the file to change and test/verdict.test.mjs is where to say so first.

/**
 * Piecewise-linear mapping from a reading to 0 (awful) through 1 (ideal).
 *
 * Curves rather than formulas because comfort in water is not linear and is
 * not modelled by anything tidy. A table of "this reading feels about this
 * good" can be read, argued with and adjusted by someone who swims, which an
 * exponent cannot.
 */
export const curve = (stops) => (value) => {
  if (value === null || value === undefined) return null;
  const [firstAt, firstScore] = stops[0];
  if (value <= firstAt) return firstScore;
  for (let i = 1; i < stops.length; i += 1) {
    const [at, score] = stops[i];
    const [prevAt, prevScore] = stops[i - 1];
    if (value <= at) {
      return prevScore + ((value - prevAt) / (at - prevAt)) * (score - prevScore);
    }
  }
  return stops[stops.length - 1][1];
};

// Sea temperature dominates, but UK swimmers acclimatise: 15 °C is a pleasant
// summer swim, not a hardship, so the curve is generous through the middle.
export const seaTempScore = curve([[5, 0], [10, 0.35], [15, 0.75], [18, 1], [24, 1]]);

export const waveScore = curve([[0, 1], [0.5, 0.85], [1, 0.45], [1.5, 0.15], [2.5, 0]]);

export const windScore = curve([[0, 1], [15, 0.65], [25, 0.3], [40, 0]]);

// What it feels like getting out, wet, into the wind — the part people remember
// as freezing long after a perfectly reasonable swim.
export const exitScore = curve([[0, 0], [8, 0.35], [14, 0.7], [20, 1]]);

export const QUALITY = { Excellent: 1, Good: 0.8, Sufficient: 0.55, Poor: 0.15, Closed: 0 };

/**
 * How offshore the wind is: +1 straight off the land, -1 straight off the sea,
 * 0 along the beach. Null when the beach's aspect is unknown.
 *
 * This is the single most useful thing local swimmers say that a forecast does
 * not: an offshore wind flattens the water and an onshore one piles it up. It
 * cannot be judged from wind direction alone, because it depends entirely on
 * which way the beach faces.
 *
 * `aspect` is that facing — the direction you look with your back to the land —
 * derived from the coastline at build time by tools/shore_aspect.py.
 *
 * `windFrom` is where the wind is coming from. That is the meteorological
 * convention every forecast uses, and it is the opposite of the way the air is
 * travelling, which is a reliable source of sign errors. A wind blowing off the
 * land therefore arrives from the bearing opposite the aspect: a beach facing
 * south has land to its north, so a northerly is offshore there.
 */
export function offshoreness(windFrom, aspect) {
  if (windFrom === null || windFrom === undefined) return null;
  if (aspect === null || aspect === undefined) return null;
  const landward = (aspect + 180) % 360;
  // Cosine of the angle between the two bearings, which falls off smoothly
  // rather than switching at some arbitrary boundary — a wind three degrees
  // off the shore-parallel is not meaningfully different from one on it.
  return Math.cos(((windFrom - landward) * Math.PI) / 180);
}

/**
 * Wave height adjusted for period.
 *
 * Half a metre of five second wind chop and half a metre of ten second ground
 * swell are the same number and not the same swim. The long period carries far
 * more energy and arrives as a surge rather than as slop, and it is what makes
 * an otherwise flat, offshore day still unswimmable.
 *
 * Period distinguishes them and is in every reading already — both Open-Meteo
 * and the CCO buoys report it.
 */
export const effectiveWave = (height, period) => {
  if (height === null || height === undefined) return null;
  if (period === null || period === undefined) return height;
  // Chop at three seconds counts as drawn; ground swell at ten counts for
  // roughly half as much again.
  return height * Math.min(1.6, Math.max(0.85, 0.85 + (period - CHOP_PERIOD_S) * 0.075));
};

/**
 * The risk of being pushed away from the beach.
 *
 * Scored apart from the wind because it is a different kind of problem. Wind
 * makes you cold and uncomfortable, which the wind curve covers. An offshore
 * wind can carry you out, and it does so over water made invitingly flat by the
 * very same wind — the one condition in this app that is more dangerous for
 * looking better.
 *
 * An onshore wind scores clean here however hard it blows: unpleasant, but it
 * pushes you back towards the sand.
 */
export const driftScore = (offshore, windSpeed) => {
  if (offshore === null || windSpeed === null || windSpeed === undefined) return null;
  if (offshore <= 0) return 1;
  // Only the offshore component counts, and only above the speed at which wind
  // starts to move a swimmer. A gentle offshore breeze on a flat day is the
  // nicest condition there is and must not be marked down for it.
  const push = offshore * Math.max(0, windSpeed - DRIFT_WIND_FLOOR_MPH);
  // Steepened after the same feedback. The old curve had sixteen miles an hour
  // straight offshore scoring 0.65, which reads as broadly fine; it is the
  // point at which an experienced swimmer starts weighing it up.
  // Tuned so that a straight offshore sixteen — where an experienced swimmer
  // says they start thinking twice — lands the whole verdict in HMMM rather
  // than YEAH. The old curve scored it 0.65, which reads as broadly fine.
  // Tuned so a straight offshore sixteen — where an experienced swimmer says
  // they start weighing it up — lands the verdict in HMMM rather than YEAH,
  // while a light offshore morning is left alone entirely.
  return curve([[0, 1], [2, 0.8], [5, 0.55], [8, 0.3], [14, 0.1], [20, 0]])(push);
};
