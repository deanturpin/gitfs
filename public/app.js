// MapLibre v6 is ESM with named exports and no default. Map is aliased
// because the bare name shadows the global Map constructor.
import { Map as MapLibre, AttributionControl, ScaleControl } from './vendor/maplibre-gl.mjs';
import { conditions, local, distanceKm, nearest, adjacent, spanBounds, skyGlyph } from './providers.js';
import { style, points, bobbing, CLASSIFICATION, VERDICT_COLOUR } from './map-style.js';
import { verdict } from './verdict.js';

import { BUOY_RANGE_KM, BUOY_STALE_HOURS, REFRESH_MINUTES } from './thresholds.js';
// How much coast to show once a position is known, as a distance rather than a
// zoom level: the same zoom covers roughly 6 km on a phone and 20 km on a
// desktop, so a number here would mean different things to different people.
// One zoom level is a doubling, so each step out is twice the coast.
const LOCATED_SPAN_M = 40_000;

// Set synchronously, before anything is awaited, so a headless DOM dump always
// sees it. Its absence means the modules never resolved or threw on the way in,
// which is the failure a smoke test can actually catch. Whether the map then
// draws needs a real browser.
document.documentElement.dataset.app = 'booting';

const el = (id) => document.getElementById(id);
const panel = el('panel');

// Whatever the panel is currently describing, so paging has somewhere to
// start from, and how far away it was if we arrived by locating — a refresh
// must not quietly drop that.
let current = null;
let currentDistance = null;

// A buoy sitting in the water, drawn rather than dotted: a body, a band, a
// light on top, and a couple of waves at its foot.
//
// The lean is applied inside the artwork rather than by rotating the finished
// icon, which is the whole reason there are three of these. Rotating the icon
// tips the waves over with the buoy, and water does not do that. Here the buoy
// leans about its own waterline while the sea stays level, which is what
// bobbing actually looks like.
//
// Three variants rather than one so a row of buoys does not look stamped. Which
// one a station gets is decided in map-style.js from its id, so it stays put
// when the readings are regenerated every half hour.
const buoyArt = (lean) => `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="68" viewBox="0 0 32 34"
     fill="none" stroke="#3ec5e0" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
  <g transform="rotate(${lean} 16 25)">
    <circle cx="16" cy="5.5" r="2.6"/>
    <path d="M16 8.1v3"/>
    <path d="M10.6 11.1h10.8l-1.6 11.6a1.8 1.8 0 0 1-1.8 1.6h-4a1.8 1.8 0 0 1-1.8-1.6z"/>
    <path d="M12.3 16.6h8.4"/>
  </g>
  <g opacity=".85">
    <path d="M2 26.5c2.3 0 2.3-2 4.7-2s2.3 2 4.6 2 2.3-2 4.7-2 2.3 2 4.7 2 2.3-2 4.6-2 2.3 2 4.7 2"/>
    <path d="M2 31c2.3 0 2.3-2 4.7-2s2.3 2 4.6 2 2.3-2 4.7-2 2.3 2 4.7 2 2.3-2 4.6-2 2.3 2 4.7 2"/>
  </g>
</svg>`;

/** The lean each variant carries, in degrees. */
export const BUOY_VARIANTS = { 'buoy-port': -11, 'buoy-level': -2, 'buoy-starboard': 10 };

/**
 * Decode all three buoy drawings before the map exists.
 *
 * MapLibre wants an image registered by the time a symbol layer asks for it. A
 * styleimagemissing handler that loads one asynchronously is too late: the
 * image does arrive and the buoys do appear, but the map has already logged
 * that it could not be loaded, which reads in the console like a broken map.
 *
 * Decoding first and registering the moment the map is constructed means it is
 * never asked for something that is not there.
 */
async function buoyImages() {
  const decoded = await Promise.all(
    Object.entries(BUOY_VARIANTS).map(async ([id, lean]) => {
      const image = new Image(64, 68);
      image.src = 'data:image/svg+xml;utf8,' + encodeURIComponent(buoyArt(lean));
      await image.decode();
      return [id, image];
    })
  );
  return decoded;
}

let [spotData, buoyData, buoyArtwork] = await Promise.all([
  local.spots(),
  local.buoys(),
  buoyImages(),
]);

// A marker the smoke test can assert on. Counting what loaded proves the
// modules resolved and the data arrived, neither of which needs a GPU — unlike
// the map canvas, which headless Chrome cannot draw at all.
document.documentElement.dataset.app = 'ready';
document.documentElement.dataset.spots = spotData.spots.length;

const map = new MapLibre({
  container: 'map',
  center: [-2.5, 53.6],
  zoom: 4.6,
  // Beyond about zoom 9 the simplified coastline starts to look blocky, but
  // clamping the map there would stop you seeing which end of the beach you
  // are on. Detail is the coastline's problem to fix, not the map's to hide.
  maxZoom: 15,
  // Added explicitly below rather than by default, so it can sit top left,
  // opposite the locate button.
  attributionControl: false,
  style: style(spotData.spots, buoyData.stations),
});



const hoursSince = (iso) => (iso ? (Date.now() - Date.parse(iso)) / 3.6e6 : Infinity);
const clock = (iso) =>
  iso ? new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }) : '';

/** One tile. `measured` decides the mark, and the mark is the honest bit. */
function tile(glyph, value, unit, label, measured, blowingFrom = null) {
  if (value === null || value === undefined) return '';
  const rounded = typeof value === 'number' ? Math.round(value * 10) / 10 : value;
  // Forecasts give the direction wind comes from; the arrow points the way it
  // is going, which is what it looks like when you are standing in it.
  const arrow = blowingFrom === null
    ? ''
    : `<svg class="whence" aria-hidden="true" style="transform:rotate(${(blowingFrom + 180) % 360}deg)"><use href="#g-arrow"/></svg>`;
  return `<div class="reading">
    <svg aria-hidden="true"><use href="#g-${glyph}"/></svg>${arrow}
    <div><b>${rounded}</b><small>${unit}</small></div>
    <i class="mark" ${measured ? 'data-measured' : ''}
       title="${measured ? 'Measured in the water' : 'Modelled'}"
       aria-label="${label}: ${rounded} ${unit}, ${measured ? 'measured' : 'modelled'}"></i>
  </div>`;
}

function nearestBuoy(spot) {
  let best = null;
  for (const station of buoyData.stations) {
    if (station.seaTemp === null) continue;
    const km = distanceKm(spot, station);
    if (km <= BUOY_RANGE_KM && (!best || km < best.km)) best = { station, km };
  }
  return best;
}

async function select(spot, distanceAway = null, spanMetres = null, { quiet = false } = {}) {
  const wasOpen = panel.hasAttribute('data-open');
  current = spot;
  if (!quiet) currentDistance = distanceAway;
  // Mark it on the map, so the card and the coast agree about where you are.
  map.getSource('selected')?.setData(points([spot]));
  panel.setAttribute('data-open', '');
  // Set for both paths: opening the card for the first time is when there is
  // least on screen and the swell has most to say. A quiet refresh sets
  // nothing, so a card left open does not blink every ten minutes.
  if (!quiet) panel.setAttribute('data-loading', '');

  if (wasOpen && !quiet) {
    // The card is a fixed height, so it no longer collapses mid-fetch. Keep
    // the previous readings on screen and dim them, so only the name changes
    // until the new numbers arrive.
    const name = panel.querySelector('.spot-name-text');
    if (name) name.textContent = spot.name;
  } else {
    panel.innerHTML = `<p class="spot-name"><span class="spot-name-text">${spot.name}</span></p>`;
  }

  let live;
  try {
    live = await conditions(spot.lat, spot.lon);
  } catch (error) {
    settle();
    panel.innerHTML = `<p class="spot-name">${spot.name}</p>
      <p class="stale">${error.message}</p>`;
    return;
  }

  const buoy = nearestBuoy(spot);
  const stale = buoy && hoursSince(buoy.station.observedAt) > BUOY_STALE_HOURS;
  // Prefer an instrument over a model whenever one is close enough and fresh.
  const useBuoy = buoy && !stale;

  // The headline. Everything below it exists so this can be argued with.
  // At an inland bathing water the marine grid finds the sea tens of km away,
  // and reporting that as this water's temperature would be a lie. A buoy, if
  // one is genuinely nearby, is still trustworthy.
  const modelled = live.marineApplies ? live : { seaTemp: null, waveHeight: null };
  const seaTemp = useBuoy ? buoy.station.seaTemp : modelled.seaTemp?.value ?? null;
  const waveHeight = useBuoy && buoy.station.waveHeight !== null
    ? buoy.station.waveHeight
    : modelled.waveHeight?.value ?? null;
  const wavePeriod = useBuoy && buoy.station.peakPeriod !== null
    ? buoy.station.peakPeriod
    : modelled.wavePeriod?.value ?? null;

  // When the readings describe, not when they were fetched. The forecast
  // publishes on the quarter hour, so a card can be a few minutes old the
  // moment it is drawn — saying so is the honest version.
  const observed = clock(live.seaTemp?.observedAt ?? live.airTemp?.observedAt ?? null);

  // The Environment Agency's pollution forecast expires each morning. If the
  // catalogue has not been refreshed since, the stored risk is yesterday's
  // answer to today's question — so it is dropped rather than shown, and the
  // verdict simply does without it.
  const riskLive = spot.riskExpiresAt
    ? Date.parse(spot.riskExpiresAt) > Date.now()
    : false;
  const risk = riskLive ? spot.risk : null;

  const call = verdict({
    seaTemp,
    waveHeight,
    wavePeriod,
    windSpeed: live.windSpeed?.value ?? null,
    windGust: live.windGust?.value ?? null,
    windDirection: live.windDirection?.value ?? null,
    feelsLike: live.feelsLike?.value ?? null,
    classification: spot.classification ?? null,
    risk: risk ?? null,
    // Derived from the coastline at build time; null for the inland waters in
    // the catalogue, which have no shore to face.
    aspect: spot.aspect ?? null,
  });

  // One picture carrying both turning points, their times and where we are
  // between them, in place of two separate entries that said neither.
  const phase = live.tidePhase;
  const next = phase
    ? (() => {
        // The curve says which end is which — it rises towards high water and
        // falls towards low — so the glyphs that used to flank the times were
        // repeating what the picture already showed.
        //
        // The depth follows: measured up from the lower of the two turning
        // points, so it reads nought at low water and the full range at high,
        // and interpolated along the same cosine the curve is drawn from.
        const swing = (1 - Math.cos(Math.PI * Math.min(Math.max(phase.through, 0), 1))) / 2;
        const now = phase.from.height + (phase.to.height - phase.from.height) * swing;
        const depth = now - Math.min(phase.from.height, phase.to.height);
        return `<span class="tidephase" aria-label="${phase.from.type === 'low' ? 'Low' : 'High'} water at ${clock(phase.from.time)}, ${phase.to.type === 'low' ? 'low' : 'high'} at ${clock(phase.to.time)}, ${depth.toFixed(1)} metres above low water and ${phase.rising ? 'rising' : 'falling'}">
          ${clock(phase.from.time)}
          ${tidePhaseWidget(phase)}
          ${clock(phase.to.time)}
          <b>${depth.toFixed(1)}<i>m</i></b>
        </span>`;
      })()
    : '';

  badge(call.percent);

  // Paint the ring with the verdict, so the marker on the map and the headline
  // in the card are visibly the same judgement.
  const tone = VERDICT_COLOUR[call.tone] ?? '#3ec5e0';
  map.setPaintProperty('selected', 'circle-color', tone);
  map.setPaintProperty('selected', 'circle-stroke-color', tone);

  settle();
  panel.innerHTML = `
    <p class="verdict" data-tone="${call.tone}">
      <span>${call.label}${observed ? `<em>@${observed}</em>` : ''}<small>${call.because ?? ''}</small></span>
      ${call.percent === null ? '' : `<b class="pct" aria-label="Rated ${call.percent} per cent">${call.percent}<i>%</i></b>`}
    </p>
    <p class="spot-name">
      <span class="spot-name-text">${spot.name}</span>
      ${(() => {
        const sky = skyGlyph(live.weatherCode, live.isDay);
        return sky
          ? `<span class="sky"><svg aria-label="Current weather"><use href="#g-${sky}"/></svg></span>`
          : '';
      })()}
    </p>
    <div class="readings">
      ${tile('temp', seaTemp, '°C', 'Sea temperature', Boolean(useBuoy))}
      ${tile('wave', waveHeight, wavePeriod ? `m · ${Math.round(wavePeriod)}s` : 'm',
        'Wave height', Boolean(useBuoy && buoy.station.waveHeight !== null))}
      ${tile('wind', live.windSpeed?.value, 'mph', 'Wind speed', false,
        live.windDirection?.value ?? null)}
      ${tile('chill', live.feelsLike?.value, '°C', 'Feels like getting out', false)}
      <div class="reading reading--word">
        <svg aria-hidden="true" style="color:${CLASSIFICATION[spot.classification] ?? 'var(--accent)'}"><use href="#g-drop"/></svg>
        <div><b style="color:${CLASSIFICATION[spot.classification] ?? 'inherit'}">${spot.classification ?? '—'}</b><small class="${riskLive ? '' : 'stale'}">${risk ?? '—'}</small></div>
        <i class="mark" title="Environment Agency forecast"
           aria-label="Water quality ${spot.classification ?? 'unknown'}, pollution risk ${risk ?? 'forecast expired'}"></i>
      </div>
    </div>
    <div class="tide">
      ${next || '<span>—</span>'}
      ${live.sunrise && live.sunset ? `<span aria-label="Sunrise at ${clock(live.sunrise)}, sunset at ${clock(live.sunset)}">
        ${clock(live.sunrise)}
        <svg aria-hidden="true"><use href="#g-sunrise"/></svg>
        ${clock(live.sunset)}
      </span>` : ''}
      ${currentDistance !== null ? `<span>⌖ ${Math.round(currentDistance)} km</span>` : ''}
      ${buoy ? `<span class="${stale ? 'stale' : ''}">${buoy.station.name}
        ${Math.round(buoy.km)} km · ${stale ? 'stale' : clock(buoy.station.observedAt)}</span>` : ''}
    </div>`;

  // A refresh must not move the map. Somebody may have panned away to look at
  // the next bay along, and having it snap back would be worse than stale
  // numbers.
  if (!quiet) frameSpot(spot, spanMetres);
}

/**
 * Put the rating on the installed app's icon.
 *
 * Only an installed PWA has an icon to badge, so this does nothing in a browser
 * tab, and support is patchy enough that it is called defensively. The number
 * is the percentage rather than the sea temperature deliberately: a bare 20 on
 * an app icon reads as twenty notifications, because that is what badges mean
 * everywhere else, whereas a percentage reads as how good it is.
 *
 * It updates while the app is open. Keeping it current in the background needs
 * either Periodic Background Sync or a push server — see issue #1.
 */
function badge(percent) {
  try {
    if (percent === null || percent === undefined) navigator.clearAppBadge?.();
    else navigator.setAppBadge?.(percent);
  } catch {
    // Unsupported, or refused because the app is not installed. Not worth
    // saying anything about: the badge is a bonus, not the app.
  }
}

/**
 * The half cycle we are in: low water at one end, high at the other, and a
 * marker showing how far between them we are.
 *
 * A cosine, because that is very close to what a tide does and it is the shape
 * everybody already pictures. Drawn rising or falling to match, so the curve
 * always runs the way the water is going — low on the left when it is coming
 * in, high on the left when it is going out.
 *
 * The times at each end are what make it readable. A height needs a datum
 * explaining before it means anything; "low at 06:12, high at 12:30, and you
 * are here" needs none.
 */
function tidePhaseWidget(phase) {
  if (!phase) return '';
  const width = 44;
  const height = 15;
  const pad = 1.6;

  // Half a cosine across the box. Rising runs from the bottom to the top;
  // falling is the same curve upside down.
  const y = (t) => {
    const swing = (1 - Math.cos(Math.PI * t)) / 2;
    const up = phase.rising ? swing : 1 - swing;
    return height - pad - up * (height - pad * 2);
  };

  const steps = 16;
  const path = Array.from({ length: steps + 1 }, (_, i) => {
    const t = i / steps;
    return `${i ? 'L' : 'M'}${(t * width).toFixed(1)} ${y(t).toFixed(1)}`;
  }).join(' ');

  const at = Math.min(Math.max(phase.through, 0), 1);
  return `<svg class="phasecurve" viewBox="0 0 ${width} ${height}" aria-hidden="true">
    <path d="${path}"/>
    <circle cx="${(at * width).toFixed(1)}" cy="${y(at).toFixed(1)}" r="2.7"/>
  </svg>`;
}

/** Release the held height once there is something real to show. */
function settle() {
  panel.removeAttribute('data-loading');
}

/**
 * Keep the selected spot in the visible strip above the panel.
 *
 * MapLibre's padding shifts the centre rather than the viewport, so measuring
 * the panel after it has rendered and passing its height keeps the marker in
 * view instead of hidden behind the readings that describe it.
 *
 * This is the only camera move in the selection path, and it has to be. A
 * separate flyTo issued alongside it was being cancelled by this easeTo on the
 * next animation frame, and because an easeTo without a zoom holds whatever
 * zoom the map has reached, the flight was abandoned partway and the requested
 * zoom never arrived. Anything wanting a particular zoom passes it through
 * here instead.
 */
function frameSpot(spot, spanMetres = null) {
  requestAnimationFrame(() => {
    const bottom = panel.getBoundingClientRect().height + 24;
    const padding = { top: 0, right: 0, bottom, left: 0 };

    // A requested span is fitted rather than converted to a zoom here, so the
    // projection — and the tile size convention that comes with it — stays
    // MapLibre's problem rather than becoming a constant to get wrong.
    if (spanMetres) {
      map.fitBounds(spanBounds(spot, spanMetres), { padding, duration: 900 });
      return;
    }

    map.easeTo({
      center: [spot.lon, spot.lat],
      zoom: map.getZoom(),
      padding,
      duration: 400,
    });
  });
}

/** Give the whole map back when nothing is selected. */
function closePanel() {
  current = null;
  currentDistance = null;
  map.getSource('selected')?.setData(points([]));
  settle();
  panel.removeAttribute('data-open');
  map.easeTo({ padding: { top: 0, right: 0, bottom: 0, left: 0 }, duration: 300 });
}

for (const layer of ['spots', 'buoys']) {
  map.on('click', layer, (e) => select(e.features[0].properties));
  map.on('mouseenter', layer, () => { map.getCanvas().style.cursor = 'pointer'; });
  map.on('mouseleave', layer, () => { map.getCanvas().style.cursor = ''; });
}


// A scale, because every distance in the app is metric — the nearest buoy is
// quoted in kilometres — and that number only means something if the map says
// what a kilometre looks like at this zoom. Top right, since locate has the
// left.
//
// Added on load rather than immediately: it measures the ground distance across
// the viewport, so it needs a map that has finished working out where it is.
// Adding it straight away throws inside MapLibre.
map.on('load', () => {
  // Registered immediately, before anything has been drawn, so the symbol layer
// never asks for an image that is not yet there.
for (const [id, image] of buoyArtwork) {
  if (!map.hasImage(id)) map.addImage(id, image, { pixelRatio: 2 });
}

// A fallback for anything that empties the image store — a style reload would.
// It should never fire in normal use; if it does, the buoys still appear and
// MapLibre logs that it had to ask.
map.on('styleimagemissing', (e) => {
  const found = buoyArtwork.find(([id]) => id === e.id);
  if (found && !map.hasImage(e.id)) map.addImage(e.id, found[1], { pixelRatio: 2 });
});

map.addControl(new ScaleControl({ maxWidth: 110, unit: 'metric' }), 'top-right');
});

map.addControl(
  new AttributionControl({
    // Always expanded. A button to reveal the credits is one more control in
    // an interface trying to have almost none, and the panel covering them when
    // a spot is selected is fine: they are legible whenever nothing is.
    compact: false,
    customAttribution: '<a href="https://open-meteo.com/">Weather data by Open-Meteo.com</a>',
  }),
  'bottom-right'
);

map.on('click', (e) => {
  const hits = map.queryRenderedFeatures(e.point, { layers: ['spots', 'buoys'] });
  if (!hits.length) closePanel();
});


// The nudge towards locate points at a button that has not been pressed. That
// is state, not history, so nothing needs remembering: it shows while no
// location has been established and goes when one is asked for.
//
// This replaced a stored flag, which was the wrong shape for the question.
// Kept in localStorage it retired the arrow permanently after one press;
// moved to sessionStorage it still needed clearing, guarding against storage
// that throws, and a query parameter to make it visible again for review.
// Deriving it removes all of that, and the old key is cleared on start so
// nobody is left carrying a flag that no longer means anything.
try {
  localStorage.removeItem('gitfs.locateUsed');
  sessionStorage.removeItem('gitfs.locateUsed');
} catch {
  // Storage unavailable, so there is nothing stale to clear.
}

function retireLocateHint() {
  const hint = el('locatehint');
  if (hint.hidden) return;
  hint.setAttribute('data-gone', '');
  // Wait for the fade before taking it out of the layout.
  setTimeout(() => { hint.hidden = true; }, 400);
}

el('locatehint').hidden = false;

el('locate').addEventListener('click', () => {
  retireLocateHint();
  const button = el('locate');
  if (!navigator.geolocation) return button.setAttribute('data-state', 'failed');
  button.setAttribute('data-state', 'seeking');

  navigator.geolocation.getCurrentPosition(
    ({ coords }) => {
      button.removeAttribute('data-state');
      const here = { lat: coords.latitude, lon: coords.longitude };
      const closest = nearest(here, spotData.spots);
      if (!closest) return;

      // Go to the spot rather than to the user: someone well inland centred on
      // their own position sees no coast at all, which looks like a failure.
      // The zoom is passed through select so there is a single camera move —
      // issuing a flyTo here as well meant the two fought and neither arrived.
      select(closest.spot, closest.km, LOCATED_SPAN_M);
    },
    // Denied, unavailable or timed out. The button carries the failure, since
    // the interface has nowhere to put a sentence.
    () => button.setAttribute('data-state', 'failed'),
    { enableHighAccuracy: true, timeout: 8000, maximumAge: 60_000 }
  );
});

/**
 * Retire the swipe demonstration, permanently for this load.
 *
 * Derived from what has happened rather than remembered, for the same reason
 * the locate arrow is: someone who has swiped once has learned the gesture, and
 * nothing needs storing to know they did it.
 */
function retireSwipeHint() {
  el('swipehint').setAttribute('data-swiped', '');
}

/**
 * Step to the next spot along the coast.
 *
 * Paging convention: dragging the panel leftwards brings the next one in from
 * the right, the way a stack of cards behaves.
 */
function page(direction) {
  if (!current) return;
  const next = adjacent(current, spotData.spots, direction);
  if (next) select(next);
}

// Swipe on the panel rather than on the map, which is already busy panning.
let touch = null;
panel.addEventListener('touchstart', (e) => {
  const [t] = e.changedTouches;
  touch = { x: t.clientX, y: t.clientY };
}, { passive: true });

panel.addEventListener('touchend', (e) => {
  if (!touch) return;
  const [t] = e.changedTouches;
  const dx = t.clientX - touch.x;
  const dy = t.clientY - touch.y;
  touch = null;
  // Must be decisively horizontal, or scrolling a tall panel would page.
  if (Math.abs(dx) < 50 || Math.abs(dx) < Math.abs(dy) * 1.5) return;
  retireSwipeHint();
  page(dx < 0 ? 1 : -1);
}, { passive: true });

// The same move for anyone on a keyboard.
addEventListener('keydown', (e) => {
  if (!current) return;
  if (e.key === 'ArrowRight') page(1);
  if (e.key === 'ArrowLeft') page(-1);
  if (e.key === 'Escape') closePanel();
});

// Keep an open card current. The buoys are rescraped every half hour and the
// forecast moves about as often, so this is not chasing anything faster than
// the data changes.
//
// Paused while the tab is hidden, because refreshing a card nobody is looking
// at is pure waste — and refreshed immediately on return, since coming back to
// a card is exactly when its age matters.
let refreshTimer = null;

/**
 * Refetch the measured readings as well as the forecast.
 *
 * Refreshing only the forecast would put a new time against a buoy reading
 * hours old, which is the precise failure this app exists to avoid. The file is
 * small and regenerated every half hour, so this is cheap and is the half that
 * actually matters.
 */
async function refreshReadings() {
  try {
    const fresh = await local.buoys();
    if (fresh?.stations?.length) {
      buoyData = fresh;
      map.getSource('buoys')?.setData(bobbing(fresh.stations));
    }
  } catch {
    // Keep the readings we have; the card shows each station's own age.
  }
  if (current) await select(current, null, null, { quiet: true });
}

function scheduleRefresh() {
  clearInterval(refreshTimer);
  refreshTimer = setInterval(() => {
    if (current && !document.hidden) refreshReadings();
  }, REFRESH_MINUTES * 60_000);
}

addEventListener('visibilitychange', () => {
  if (document.hidden || !current) return;
  refreshReadings();
  // Restart the clock, so returning does not leave a refresh due immediately.
  scheduleRefresh();
});

scheduleRefresh();
