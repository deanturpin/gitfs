// Upstream data, behind one interface.
//
// Everything that leaves the browser goes through here. Open-Meteo's free
// service prohibits advertising and subscriptions, so if this ever needs to
// earn, only this file changes.
//
// Every metric returned carries its provenance. `measured` distinguishes an
// instrument in the water from a model's opinion of it, and the UI must render
// those differently — that distinction is the whole point of the app.

const MARINE = 'https://marine-api.open-meteo.com/v1/marine';
const FORECAST = 'https://api.open-meteo.com/v1/forecast';

/** A single reading, with enough context for the UI to be honest about it. */
const metric = (value, unit, source, measured, observedAt) =>
  value === null || value === undefined
    ? null
    : { value, unit, source, measured, observedAt };

const query = (base, params) =>
  `${base}?${new URLSearchParams({ ...params, timezone: 'Europe/London' })}`;

async function json(url, init) {
  const response = await fetch(url, init);
  if (!response.ok) throw new Error(`${response.status} from ${new URL(url, location.href).host}`);
  return response.json();
}

/**
 * Turning points in the tidal curve, as {type, time, height}.
 * Open-Meteo gives an hourly sea level series rather than tide tables, so high
 * and low water are the local maxima and minima of that series.
 */
function tideTurns(times, heights) {
  const turns = [];
  for (let i = 1; i < heights.length - 1; i += 1) {
    const [previous, current, next] = [heights[i - 1], heights[i], heights[i + 1]];
    if (current === null || previous === null || next === null) continue;
    if (current >= previous && current >= next) turns.push({ type: 'high', time: times[i], height: current });
    if (current <= previous && current <= next) turns.push({ type: 'low', time: times[i], height: current });
  }
  return turns;
}

/**
 * Live conditions for a point.
 *
 * Note the returned position: the marine grid is coarse and snaps requests to
 * its nearest wet cell, which near Brighton sits about 3 km offshore. Callers
 * should show where the model actually sampled rather than where they asked.
 */
export async function conditions(lat, lon) {
  const [marine, weather] = await Promise.all([
    json(
      query(MARINE, {
        latitude: lat,
        longitude: lon,
        current: 'sea_surface_temperature,wave_height,wave_period,wave_direction',
        hourly: 'sea_level_height_msl',
        forecast_days: 2,
      })
    ),
    json(
      query(FORECAST, {
        latitude: lat,
        longitude: lon,
        current: 'temperature_2m,apparent_temperature,wind_speed_10m,wind_gusts_10m,wind_direction_10m,precipitation',
        daily: 'sunrise,sunset',
        wind_speed_unit: 'mph',
      })
    ),
  ]);

  const sea = marine.current ?? {};
  const air = weather.current ?? {};
  const at = sea.time ?? air.time ?? null;
  const source = 'open-meteo';

  const sampledAt = { lat: marine.latitude, lon: marine.longitude };
  // How far the marine grid moved us. A few kilometres is the grid snapping to
  // its nearest wet cell and is fine. Tens of kilometres means it found the sea
  // somewhere else entirely — which is what happens at an inland bathing water,
  // where presenting a distant sea temperature as the river's would be a lie.
  const sampleOffsetKm = distanceKm({ lat, lon }, sampledAt);

  return {
    sampledAt,
    sampleOffsetKm,
    marineApplies: sampleOffsetKm <= 25,
    seaTemp: metric(sea.sea_surface_temperature, '°C', source, false, at),
    waveHeight: metric(sea.wave_height, 'm', source, false, at),
    wavePeriod: metric(sea.wave_period, 's', source, false, at),
    waveDirection: metric(sea.wave_direction, '°', source, false, at),
    airTemp: metric(air.temperature_2m, '°C', source, false, at),
    feelsLike: metric(air.apparent_temperature, '°C', source, false, at),
    windSpeed: metric(air.wind_speed_10m, 'mph', source, false, at),
    windGust: metric(air.wind_gusts_10m, 'mph', source, false, at),
    windDirection: metric(air.wind_direction_10m, '°', source, false, at),
    precipitation: metric(air.precipitation, 'mm', source, false, at),
    tide: tideTurns(marine.hourly?.time ?? [], marine.hourly?.sea_level_height_msl ?? []),
    // Light, not weather. A swim after sunset is a different proposition, and
    // a time needs no translating.
    sunrise: weather.daily?.sunrise?.[0] ?? null,
    sunset: weather.daily?.sunset?.[0] ?? null,
  };
}

/**
 * Static datasets, regenerated on a schedule because they block CORS.
 *
 * GitHub Pages serves everything with a four-hour max-age, which would leave a
 * returning visitor looking at buoy readings hours older than the half-hourly
 * refresh that produced them. `no-cache` revalidates rather than refusing the
 * cache outright, so an unchanged file still costs only a 304.
 *
 * The coastline is deliberately not in here: it is fetched by MapLibre as a
 * style source and should stay cached, because coastlines do not move.
 */
const FRESH = { cache: 'no-cache' };

export const local = {
  spots: () => json('data/bathing.json', FRESH),
  buoys: () => json('data/buoys.json', FRESH),
};

/** Great-circle distance in km, for matching a spot to its nearest buoy. */
export function distanceKm(a, b) {
  const radians = (d) => (d * Math.PI) / 180;
  const dLat = radians(b.lat - a.lat);
  const dLon = radians(b.lon - a.lon);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(radians(a.lat)) * Math.cos(radians(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.sqrt(h));
}

/**
 * The closest spot to a position, with its distance.
 *
 * Deliberately uncapped: someone in Birmingham is 120 km from the sea and
 * still wants to know where to go. The distance is returned so the caller can
 * say how far it is rather than pretending it is local.
 */
export function nearest(position, spots) {
  let best = null;
  for (const spot of spots) {
    const km = distanceKm(position, spot);
    if (!best || km < best.km) best = { spot, km };
  }
  return best;
}

/**
 * The next spot along the coast, in one direction or the other.
 *
 * "Left" and "right" cannot mean west and east: that works along the south
 * coast and falls apart in Wales, where the coastline runs north to south. So
 * the local direction of the coast is derived from the neighbouring spots —
 * their first principal component — and candidates are projected onto it.
 *
 * @param direction -1 or 1; which way along that axis to step.
 */
export function adjacent(spot, spots, direction, neighbours = 10) {
  // Work in kilometres so that a degree of longitude does not outweigh a
  // degree of latitude at these latitudes.
  const scale = Math.cos((spot.lat * Math.PI) / 180);
  const toXY = (s) => ({ x: (s.lon - spot.lon) * scale * 111.32, y: (s.lat - spot.lat) * 111.32, s });

  const near = spots
    .filter((s) => s !== spot && !(s.lat === spot.lat && s.lon === spot.lon))
    .map(toXY)
    .sort((a, b) => Math.hypot(a.x, a.y) - Math.hypot(b.x, b.y))
    .slice(0, neighbours);
  if (!near.length) return null;

  // First principal component of the neighbourhood, which for spots strung
  // along a shoreline is the direction of the shoreline.
  const meanX = near.reduce((t, p) => t + p.x, 0) / near.length;
  const meanY = near.reduce((t, p) => t + p.y, 0) / near.length;
  let sxx = 0;
  let syy = 0;
  let sxy = 0;
  for (const p of near) {
    const dx = p.x - meanX;
    const dy = p.y - meanY;
    sxx += dx * dx;
    syy += dy * dy;
    sxy += dx * dy;
  }
  const angle = 0.5 * Math.atan2(2 * sxy, sxx - syy);
  const axis = { x: Math.cos(angle), y: Math.sin(angle) };

  // Step to the closest candidate lying the requested way along that axis.
  let best = null;
  for (const p of near) {
    const along = (p.x * axis.x + p.y * axis.y) * direction;
    if (along <= 0) continue;
    const distance = Math.hypot(p.x, p.y);
    if (!best || distance < best.distance) best = { spot: p.s, distance, along };
  }
  return best ? best.spot : null;
}

/**
 * A bounding box a given distance wide, centred on a spot.
 *
 * Asking for a span rather than a zoom level is the honest way to say "show me
 * ten kilometres": a fixed zoom covers roughly 6 km on a phone and 20 km on a
 * desktop, because it is a scale per pixel and the two have very different
 * numbers of pixels. Handing the box to fitBounds also leaves the projection
 * maths — and the tile size convention that goes with it — to MapLibre.
 *
 * The box is deliberately short in latitude, so on a tall map the width is what
 * constrains the fit.
 */
export function spanBounds(spot, metres) {
  const metresPerDegreeLat = 111320;
  const metresPerDegreeLon = metresPerDegreeLat * Math.cos((spot.lat * Math.PI) / 180);
  const halfLon = metres / 2 / metresPerDegreeLon;
  const halfLat = metres / 20 / metresPerDegreeLat;
  return [
    [spot.lon - halfLon, spot.lat - halfLat],
    [spot.lon + halfLon, spot.lat + halfLat],
  ];
}
