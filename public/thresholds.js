// The numbers you would argue about in a car park.
//
// Every sharp threshold in the app is here, named and explained, so that
// changing one is a decision rather than an archaeology exercise. Nothing here
// is a fact about the sea — they are all judgements about swimming, and they
// are meant to be disagreed with.
//
// The gradual judgements are not here: how good 14 °C is compared with 18 °C is
// a curve rather than a line, and those live in conditions.js as tables you can
// read. This file holds the places where the answer changes abruptly.
//
// Change a number, run `make test`, and see which of the named scenarios in
// test/verdict.test.mjs now disagrees with you. If none does, the scenarios are
// not covering the case you care about and it is worth adding one.

// --- The vetoes -----------------------------------------------------------
// Conditions that settle it on their own. No amount of warm water or sunshine
// offsets these, which is why they are separate from the scoring.

/** Waves above this are too rough to swim in, in metres. */
export const MAX_WAVE_HEIGHT_M = 1.5;

/** Water below this is dangerously cold without specialist preparation, in °C. */
export const MIN_SEA_TEMP_C = 6;

/**
 * A wind strong enough to carry a swimmer out, in mph, when it is blowing off
 * the land. Both this and the one below have to be true: a gale blowing onshore
 * is unpleasant rather than dangerous, because it pushes you back to the beach.
 *
 * Was 28, which a local swimmer pointed out is far too high — that is a near
 * gale, and by then the question has answered itself. They think twice at about
 * 16, so the veto sits above that and the drift curve does the work in between:
 * sixteen should read as a poor idea rather than a forbidden one.
 */
export const OFFSHORE_VETO_WIND_MPH = 20;

/**
 * How squarely offshore that wind has to be, from 0 (along the beach) to 1
 * (straight off the land). Just over a half is roughly 57 degrees either side
 * of dead offshore.
 */
export const OFFSHORE_VETO_STRENGTH = 0.55;

// --- The bands ------------------------------------------------------------
// Where the score stops being one word and becomes the next. The scale runs 0
// to 1; the percentage shown in the app is this number times a hundred.

/** At or above this, HELL YEAH. */
export const HELL_YEAH_AT = 0.8;

/** At or above this, YEAH. */
export const YEAH_AT = 0.66;

/**
 * At or above this, HMMM; below it, FUCK NO.
 *
 * Deliberately low. FUCK NO is a strong thing to say and is mostly reached
 * through the vetoes above — a seven degree dip in a stiff breeze is hardcore
 * rather than forbidden.
 */
export const HMMM_AT = 0.33;

// --- How the score is put together ----------------------------------------

/**
 * How much of the final score comes from the worst single factor rather than
 * from the average of all of them.
 *
 * A plain average let one bad factor be outvoted by four good ones and called
 * Poor water quality a resounding yes. A swim is only as good as its worst
 * aspect, so the weakest one gets a say of its own.
 */
export const WEAKEST_LINK_SHARE = 0.3;

/**
 * How much of the total weight has to be present before the app will commit to
 * a confident answer.
 *
 * With the sea temperature missing, a high average is an opinion formed from
 * whatever happened to be available. Below this, the verdict is capped at HMMM
 * and the percentage is withheld rather than shown arguing with the word.
 */
export const MIN_WEIGHT_COVERAGE = 0.6;

// --- Wind and water -------------------------------------------------------

/**
 * Below this wind speed, in mph, an offshore breeze will not move a swimmer.
 *
 * Held at 8 deliberately. Lowering it made sixteen behave correctly but started
 * marking down a light offshore morning, which is the nicest condition there
 * is — the steepness above the floor is the right lever, not the floor itself.
 */
export const DRIFT_WIND_FLOOR_MPH = 8;

/**
 * The period, in seconds, at which waves stop being local wind chop and start
 * being ground swell that carries real energy. Used to weight wave height:
 * half a metre at ten seconds is a different swim from half a metre at four.
 */
export const CHOP_PERIOD_S = 3;

// --- Which readings to trust ----------------------------------------------

/**
 * How far away a wave buoy can be and still be describing your water, in km.
 * Beyond this its reading is offered as context rather than used as the answer.
 */
export const BUOY_RANGE_KM = 40;

/**
 * How old a buoy reading can be before it is shown as stale rather than
 * quietly trusted, in hours.
 */
export const BUOY_STALE_HOURS = 3;

/**
 * How often the open card refetches its readings, in minutes.
 *
 * The buoys are rescraped every half hour and the forecast updates about as
 * often, so anything faster is asking the same question twice. Ten minutes
 * keeps a card left open on a windowsill honest without hammering anybody.
 */
export const REFRESH_MINUTES = 10;

/**
 * How far the marine model may snap away from the point asked for, in km,
 * before its readings are discarded.
 *
 * The grid finds its nearest wet cell, which at an inland bathing water is the
 * open sea tens of kilometres away. Presenting that as a river's temperature
 * would be a lie.
 */
export const MARINE_MAX_OFFSET_KM = 25;
