// Should you get in? The whole product, in three words.
//
// The verdict is a weighted sum of normalised factors, with a short list of
// vetoes that override it outright. Weights live in data rather than in code
// because a swimmer and a surfer read identical readings with opposite signs —
// offshore wind is a hazard to one and a gift to the other — so adding a
// persona must be a config change, never a rewrite.
//
// The plan's rule stands: never show this without the readings that produced
// it. A number nobody can interrogate is a number nobody believes.
//
// What each reading means lives in conditions.js. This file only decides how
// much each one matters and what to call the result.

import {
  QUALITY,
  driftScore,
  effectiveWave,
  exitScore,
  offshoreness,
  seaTempScore,
  waveScore,
  windScore,
} from './conditions.js';

import {
  HELL_YEAH_AT,
  HMMM_AT,
  MAX_WAVE_HEIGHT_M,
  MIN_SEA_TEMP_C,
  MIN_WEIGHT_COVERAGE,
  OFFSHORE_VETO_STRENGTH,
  OFFSHORE_VETO_WIND_MPH,
  WEAKEST_LINK_SHARE,
  YEAH_AT,
} from './thresholds.js';

// Re-exported so callers have one place to import the judgement from.
export { offshoreness };


export const PERSONAS = {
  swim: {
    seaTemp: 0.30,
    quality: 0.20,
    waves: 0.16,
    exit: 0.12,
    wind: 0.10,
    drift: 0.12,
  },
};

export const VERDICTS = {
  yes: { label: 'HELL YEAH', tone: 'yes' },
  good: { label: 'YEAH', tone: 'good' },
  hmm: { label: 'HMMM', tone: 'hmm' },
  no: { label: 'FUCK NO', tone: 'no' },
};

/**
 * Conditions that settle it on their own, whatever the average says.
 * A good temperature cannot make up for a sewage discharge.
 */
function veto(reading) {
  if (reading.classification === 'Closed') return 'closed';
  if (reading.risk && reading.risk !== 'normal') return 'pollution risk';
  if (reading.waveHeight !== null && reading.waveHeight > MAX_WAVE_HEIGHT_M) return 'too rough';
  if (reading.seaTemp !== null && reading.seaTemp < MIN_SEA_TEMP_C) return 'dangerously cold';
  // A strong wind blowing off the land will take you with it, and it does so
  // over water that looks invitingly flat. This is the one condition here that
  // is more dangerous for looking pleasant.
  const offshore = offshoreness(reading.windDirection, reading.aspect);
  if (offshore !== null
      && offshore > OFFSHORE_VETO_STRENGTH
      && (reading.windSpeed ?? 0) >= OFFSHORE_VETO_WIND_MPH) return 'blown offshore';
  return null;
}

/**
 * @param reading flattened values: seaTemp, waveHeight, windSpeed, feelsLike,
 *   classification, risk. Missing values drop out of the average rather than
 *   scoring zero, so an absent buoy does not read as bad conditions.
 */
export function verdict(reading, persona = PERSONAS.swim) {
  const blocked = veto(reading);
  // A veto is a genuine zero, not a missing reading: nought per cent is the
  // honest thing to show for a beach that is shut.
  if (blocked) return { ...VERDICTS.no, score: 0, percent: 0, because: blocked };

  const offshore = offshoreness(reading.windDirection, reading.aspect);

  const factors = {
    seaTemp: seaTempScore(reading.seaTemp),
    waves: waveScore(effectiveWave(reading.waveHeight, reading.wavePeriod)),
    // Gusts are what actually knocks you about and chills you, so the stronger
    // of the two is what counts.
    wind: windScore(Math.max(reading.windSpeed ?? 0, reading.windGust ?? 0) || reading.windSpeed),
    exit: exitScore(reading.feelsLike),
    quality: reading.classification ? QUALITY[reading.classification] ?? 0.5 : null,
    drift: driftScore(offshore, reading.windSpeed),
  };

  let total = 0;
  let weighed = 0;
  const contributing = [];
  for (const [key, weight] of Object.entries(persona)) {
    if (factors[key] === null || factors[key] === undefined) continue;
    total += factors[key] * weight;
    weighed += weight;
    contributing.push(factors[key]);
  }
  if (!weighed) return { ...VERDICTS.hmm, score: null, percent: null, because: 'no readings' };

  // A weighted average lets one bad factor be drowned out by four good ones,
  // which called Poor water quality a resounding yes. A swim is only as good
  // as its worst aspect, so the weakest factor pulls the result down.
  const average = total / weighed;
  const weakestScore = Math.min(...contributing);
  const score = (1 - WEAKEST_LINK_SHARE) * average + WEAKEST_LINK_SHARE * weakestScore;
  // Confidence needs coverage. With most of the weight missing — no sea
  // temperature, say — a high average is an opinion formed from the factors
  // that happened to be available, so it must not read as a confident yes.
  const thin = weighed < MIN_WEIGHT_COVERAGE;
  // The weakest contributor is the honest explanation for anything short of a
  // yes, and it is what the swimmer can actually plan around.
  const weakest = Object.entries(factors)
    .filter(([key, v]) => v !== null && v !== undefined && persona[key])
    .sort((a, b) => a[1] - b[1])[0];

  // FUCK NO is a strong thing to say, so it is kept for conditions that earn
  // it. A 7 C winter dip in a stiff breeze is hardcore rather than forbidden,
  // and lands in HMMM; the bottom band is mostly reached through the vetoes.
  //
  // The YEAH boundary is deliberately tight. A chilly flat day and a choppy
  // warm one score within 0.01 of each other, so the line between them is a
  // judgement rather than a measurement, and it is drawn on the cautious side:
  // chop is a hazard a swimmer feels immediately.
  let band = score >= HELL_YEAH_AT ? VERDICTS.yes
    : score >= YEAH_AT ? VERDICTS.good
    : score >= HMMM_AT ? VERDICTS.hmm
    : VERDICTS.no;
  // Without the readings to back it, a confident yes becomes a shrug.
  if (thin && (band === VERDICTS.yes || band === VERDICTS.good)) band = VERDICTS.hmm;
  return {
    ...band,
    score,
    // Withheld when the readings are too thin to support the number. Showing
    // 90% beside HMMM would have the headline arguing with itself.
    percent: thin ? null : Math.round(score * 100),
    because: thin ? 'not enough readings'
      : band === VERDICTS.yes ? null
      : weakest?.[0] ?? null,
  };
}
