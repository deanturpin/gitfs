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

/** Piecewise-linear mapping from a reading to 0 (awful) through 1 (ideal). */
const curve = (stops) => (value) => {
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
// summer swim, not a hardship, so the curve is generous in the middle.
const seaTempScore = curve([[5, 0], [10, 0.35], [15, 0.75], [18, 1], [24, 1]]);
const waveScore = curve([[0, 1], [0.5, 0.85], [1, 0.45], [1.5, 0.15], [2.5, 0]]);
const windScore = curve([[0, 1], [15, 0.65], [25, 0.3], [40, 0]]);
// What it feels like getting out, wet, in the wind — the part people remember
// as "freezing" long after a perfectly reasonable swim.
const exitScore = curve([[0, 0], [8, 0.35], [14, 0.7], [20, 1]]);

const QUALITY = { Excellent: 1, Good: 0.8, Sufficient: 0.55, Poor: 0.15, Closed: 0 };

export const PERSONAS = {
  swim: {
    seaTemp: 0.34,
    quality: 0.22,
    waves: 0.18,
    exit: 0.14,
    wind: 0.12,
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
  if (reading.waveHeight !== null && reading.waveHeight > 1.5) return 'too rough';
  if (reading.seaTemp !== null && reading.seaTemp < 6) return 'dangerously cold';
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

  const factors = {
    seaTemp: seaTempScore(reading.seaTemp),
    waves: waveScore(reading.waveHeight),
    wind: windScore(reading.windSpeed),
    exit: exitScore(reading.feelsLike),
    quality: reading.classification ? QUALITY[reading.classification] ?? 0.5 : null,
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
  const score = 0.7 * average + 0.3 * weakestScore;
  // Confidence needs coverage. With most of the weight missing — no sea
  // temperature, say — a high average is an opinion formed from the factors
  // that happened to be available, so it must not read as a confident yes.
  const thin = weighed < 0.6;
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
  let band = score >= 0.8 ? VERDICTS.yes
    : score >= 0.66 ? VERDICTS.good
    : score >= 0.33 ? VERDICTS.hmm
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
