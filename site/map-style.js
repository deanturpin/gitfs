// The map's whole appearance, in one place.
//
// Kept apart from app.js so it can be validated against the MapLibre style
// specification without a browser. That matters more here than usual: a layer
// naming a source that does not exist renders a blank blue rectangle, which on
// a map of the sea is indistinguishable from a working map of open water.

export const SEA = '#06283d';
export const LAND = '#0e3b54';
export const ACCENT = '#3ec5e0';

// Annual bathing water classification, carried as colour so the map reads at a
// glance with no legend to translate.
export const CLASSIFICATION = {
  Excellent: '#4ade80',
  Good: '#a3e635',
  Sufficient: '#fbbf24',
  Poor: '#f87171',
  // Not a water quality grade but a state: the site is shut, which a swimmer
  // needs to see more urgently than any rating.
  Closed: '#a855f7',
};

const UNCLASSIFIED = '#94a3b8';

/**
 * The verdict palette, matching the tones in style.css. Kept here because the
 * selection ring on the map is painted with it too: the ring and the headline
 * describe the same judgement, so they say it in the same colour.
 */
export const VERDICT_COLOUR = {
  yes: '#4ade80',
  good: '#a3e635',
  hmm: '#fbbf24',
  no: '#f87171',
};

/** Points as GeoJSON, carrying every property through for the detail panel. */
export const points = (items) => ({
  type: 'FeatureCollection',
  features: items.map((item) => ({
    type: 'Feature',
    geometry: { type: 'Point', coordinates: [item.lon, item.lat] },
    properties: { ...item },
  })),
});

/** The buoy artwork, one per lean. Drawn in app.js, named here. */
export const BUOY_ICONS = ['buoy-port', 'buoy-level', 'buoy-starboard'];

/**
 * Give each buoy one of the three leans, so a row of them looks like things
 * floating rather than things printed.
 *
 * Chosen from the station id rather than at random, so a buoy keeps the same
 * angle when the readings are regenerated every half hour instead of tipping
 * to a new one each time.
 */
export const bobbing = (stations) => ({
  type: 'FeatureCollection',
  features: points(stations).features.map((feature) => {
    // FNV-1a rather than a simple polynomial. Station ids differ by a digit or
    // two — cco:81, cco:78 — and a weak hash leaves near-identical strings in
    // the same bucket, which put three buoys in four at the same angle.
    const id = String(feature.properties.id ?? '');
    let hash = 0x811c9dc5;
    for (let i = 0; i < id.length; i += 1) {
      hash ^= id.charCodeAt(i);
      hash = Math.imul(hash, 0x01000193) >>> 0;
    }
    return {
      ...feature,
      properties: { ...feature.properties, buoyIcon: BUOY_ICONS[hash % BUOY_ICONS.length] },
    };
  }),
});

/**
 * No glyphs or sprite are declared: nothing on this map is drawn as text, so
 * there is no font stack to fetch and nothing to translate.
 */
export const style = (spots, buoys) => ({
  version: 8,
  sources: {
    land: {
      type: 'geojson',
      data: 'data/coast.geojson',
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    },
    spots: {
      type: 'geojson',
      data: points(spots),
      attribution: 'Bathing water &copy; <a href="https://environment.data.gov.uk/">Environment Agency</a>, OGL v3',
    },
    buoys: {
      type: 'geojson',
      data: bobbing(buoys),
      attribution: 'Buoys &copy; <a href="https://coastalmonitoring.org/">CCO</a>, OGL v3',
    },
    // One point at most: whichever spot the panel is describing.
    selected: { type: 'geojson', data: points([]) },
  },
  layers: [
    { id: 'sea', type: 'background', paint: { 'background-color': SEA } },
    { id: 'land', type: 'fill', source: 'land', paint: { 'fill-color': LAND } },
    {
      id: 'shore',
      type: 'line',
      source: 'land',
      paint: { 'line-color': ACCENT, 'line-width': 0.7, 'line-opacity': 0.45 },
    },
    {
      // Drawn beneath the spots: a measurement station is context for a swim
      // spot, not a destination in itself.
      //
      // A symbol rather than a circle, because a circle layer can only draw a
      // circle. The image is registered on demand — see BUOY_ICON in app.js —
      // and anchored at its waterline so the buoy floats on its coordinate
      // rather than being centred over it.
      id: 'buoys',
      type: 'symbol',
      source: 'buoys',
      layout: {
        // The lean is baked into the artwork, so the sea at the buoy's foot
        // stays level. Rotating the icon instead would tip the waves over too.
        'icon-image': ['get', 'buoyIcon'],
        'icon-size': ['interpolate', ['linear'], ['zoom'], 4, 0.42, 8, 0.7, 12, 1.1],
        // Buoys are sparse and each one is a real station; none should be
        // dropped for want of room.
        'icon-allow-overlap': true,
        'icon-ignore-placement': true,
      },
    },
    {
      // Drawn beneath the spots so the classification colour stays readable in
      // the middle of the ring rather than being covered by it.
      id: 'selected',
      type: 'circle',
      source: 'selected',
      paint: {
        'circle-radius': ['interpolate', ['linear'], ['zoom'], 4, 8, 12, 26],
        'circle-color': ACCENT,
        'circle-opacity': 0.16,
        'circle-stroke-color': ACCENT,
        'circle-stroke-width': 2,
      },
    },
    {
      id: 'spots',
      type: 'circle',
      source: 'spots',
      paint: {
        'circle-radius': ['interpolate', ['linear'], ['zoom'], 4, 3, 8, 7, 12, 15],
        'circle-color': [
          'match',
          ['get', 'classification'],
          ...Object.entries(CLASSIFICATION).flat(),
          UNCLASSIFIED,
        ],
        'circle-stroke-color': SEA,
        'circle-stroke-width': ['interpolate', ['linear'], ['zoom'], 4, 1, 12, 2.5],
      },
    },
  ],
});
