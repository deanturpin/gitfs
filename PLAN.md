# gitfs

Map-based conditions for sea swimmers and other sea goers.

## What it is

A map of the coast. Tap a spot, see whether it is worth getting in: sea
temperature, waves, wind, tide state and water quality — each labelled with
where the number came from.

## The premise

Every sea temperature site shows one satellite-derived figure and stops. That
figure is often defensible and still fails the user, because it cannot explain
why 20.5 °C felt cold. Answering that needs three things those sites omit: a
measured reading rather than a modelled one, the tide state at the time, and the
wind chill on exit.

So the product principle is **provenance**: show measured data where it exists,
modelled data where it does not, and never let the reader confuse the two. This
is a constraint on the data layer, not a feature to bolt on.

## Decisions taken

| Decision | Choice | Consequence |
| --- | --- | --- |
| Commercial intent | May monetise later | Every upstream call sits behind a provider interface |
| Geographic scope | UK first, region-aware | Buoys and water quality are optional per-region layers |
| Name | `gitfs` | The name carries the tone, so the UI needs no words |

## Stack

**Fully static. There is no runtime backend.**

Nothing in this app is per-user or per-request — everyone looking at a given
spot wants the same buoy reading and the same risk forecast. There is nothing
for a server to compute, so a server would be a cache with a bill attached.

```text
Static host (Pages, GitHub Pages, any CDN)
|-- index.html, app.js, MapLibre
|-- coast.pmtiles      OSM coastline, built once, rarely rebuilt
|-- spots.json         EA sites and buoy locations, generated at build
`-- data/
    |-- buoys.json     regenerated every 30 minutes
    `-- bathing.json   regenerated daily

Browser calls Open-Meteo directly
```

- **Basemap** — OSM coastline only. No roads, no buildings, no labels; the
  spots are the labels. Start with the simplified land polygons clipped to a UK
  bbox, roughly a megabyte of GeoJSON, good to zoom 9. If closer zoom is wanted
  later, clip the full split set and run tippecanoe into `coast.pmtiles`. GitHub
  Pages serves range requests, so pmtiles needs no special host.
- **Frontend** — vanilla JS PWA with MapLibre GL JS. One map, one detail panel,
  one filter row. A framework would be dead weight, and the glyph-only rule
  means there is no component library to lean on regardless.
- **Live conditions** — fetched from the browser straight to Open-Meteo, which
  sends `access-control-allow-origin: *`.
- **CORS-blocked sources become generated files.** The Environment Agency API
  and the CCO buoy pages send no CORS headers, but neither is per-request data.
  A scheduled job writes them to static JSON, which the browser reads like any
  other asset.
- **Scheduled job** — GitHub Actions cron, writing to a `data` branch so the
  main history does not accumulate 48 commits a day.

### Why client-side beats a Worker here

Open-Meteo's free limits are per IP. Routed through a Worker, every user shares
a single quota. Called from the browser, each user spends their own 10,000 per
day, which is effectively unlimited for one person. The browser distributes
load that a Worker would concentrate.

The commercial restriction still applies to the app wherever the call
originates, so the provider interface below still earns its place.

## The cacheability rule

The dividing line used to split `tickets` from `osm` still decides where any
future source belongs. Here it maps onto build-time versus runtime rather than
onto two services.

| Snapshot — generated, served static | Passthrough — fetched live by the browser |
| --- | --- |
| Coastline and spot catalogue | Open-Meteo marine and forecast |
| EA ratings and daily risk forecast | |
| CCO buoy readings | |

Note that the CORS-blocked sources land on the snapshot side. That is not a
coincidence: data a browser cannot fetch directly is data that changes slowly
enough to be regenerated on a schedule.

## Data sources

All verified live on 2026-08-25.

| Source | Gives | Coverage | CORS | How it reaches the browser |
| --- | --- | --- | --- | --- |
| Open-Meteo Marine | Sea temp, waves, swell, tide curve | Global | Yes | Direct fetch |
| Open-Meteo Forecast | Air, wind, gusts, UV | Global | Yes | Direct fetch |
| CCO buoys | Measured sea temp and wave height, 53 stations | England and Wales | No | Scraped every 30 min to `buoys.json` |
| EA bathing water | Annual rating, daily risk forecast, 464 sites | England only | No | Fetched daily to `bathing.json` |
| OSM land polygons | Coastline | Global, clipped to UK | n/a | Static asset, ODbL |

Open-Meteo returns a usable tidal curve as `sea_level_height_msl`, so no
separate tide API is needed for a high-or-low read. The Admiralty API remains an
option if proper harmonic predictions are ever wanted.

Its sea surface temperature does not come from the wave models — requesting it
with an explicit `models=` parameter returns null. It is a separate, coarser
analysis product, which is precisely why a measured buoy reading should be the
headline wherever one exists.

The EA object carries more than the annual classification. `latestRiskPrediction`
is a daily pollution-risk forecast with an explicit `expiresAt`, and
`waterQualityImpactedByHeavyRain` flags sites where rainfall matters. Both are
nested in the main bathing-water record, not on the separate in-season endpoints,
which return 404 or empty. `samplingPoint` carries lat and long, so the spot
catalogue can be generated rather than hand-built.

**Coverage is narrower than the UK.** All 464 designated bathing waters are in
England: Wales is Natural Resources Wales, Scotland is SEPA and Northern
Ireland is NIEA, each with its own data. The CCO buoys do reach Wales, so a
Welsh coast currently has measurements but no swim spots. Closing that gap
means one additional source per nation, and the region field in the catalogue
already exists to hold them.

Storm overflow feeds from individual water companies remain uninvestigated. The
EA risk forecast may make them unnecessary for a first release.

## Shapes that matter

Every metric carries its provenance, because the UI renders measured and
modelled differently:

```js
{ value: 20.8, unit: "C", source: "cco:81", measured: true, observedAt: "..." }
```

Spots declare which enrichment layers exist for them, so new regions are data
rather than schema changes:

```js
{
  id: "brighton-central",
  lat: 50.8198, lon: -0.1372,
  region: "gb-eng",
  layers: { buoy: "cco:81", bathing: "ukj2100-14950" }
}
```

Scoring is a weighting table per persona from the outset. A swimmer and a surfer
read identical data with opposite signs — offshore wind is a hazard to one and a
gift to the other. With weights in data, adding surfers is a config change; with
weights in code it is a rewrite.

```js
const PERSONAS = {
  swim: { sst: 0.35, quality: 0.20, wave: 0.20, wind: 0.15, tide: 0.10 },
};
```

## Build order

1. **Walking skeleton** — Worker, MapLibre, Protomaps basemap, spots from static
   JSON, tap a spot to fetch live Open-Meteo. Proves the whole path end to end.
2. **Measured layer** — cron scraper, KV, and the measured-versus-modelled
   distinction visible in the UI. This is the differentiator; it comes early.
3. **Water quality** — EA classifications, then storm overflow once the feed
   situation is understood.
4. **Scoring and personas** — the weighting table, and the expandable score.
5. **PWA polish** — offline shell, install prompt, icons.

## Rules

- Numbers are the content, and numbers need no translating. Controls are glyphs.
  Words survive only as `aria-label`s.
- Never show a combined score without letting it expand into the values that
  produced it. An unexplained number gets distrusted and the app gets abandoned.
- Surface staleness. A buoy that stopped reporting must look different from one
  reading a steady figure.

## Licensing and hosting

Audited 2026-08-25. Every source is openly licensed and redistributable, so the
repository can be public.

| Source | Licence | Redistribute | Commercial | Attribution |
| --- | --- | --- | --- | --- |
| Open-Meteo data | CC-BY 4.0 | Yes | Yes | `Weather data by Open-Meteo.com`, as a link |
| CCO buoys | OGL v3 | Yes | Yes | Crown copyright |
| EA bathing water | OGL v3 | Yes | Yes | Crown copyright |
| OSM land polygons | ODbL 1.0 | Yes, share-alike | Yes | OpenStreetMap contributors |

**Open-Meteo splits data from service.** The data is CC-BY 4.0 and commercial
use of it is fine. The free API *service* separately prohibits advertising and
subscriptions. These are different instruments, so monetising later means paying
for API access rather than relicensing anything.

**ODbL is share-alike, so the repository needs two licences.** A coastline
clipped and simplified from OSM is a derived database and remains ODbL whatever
licence the code carries. State the code licence and the `data/` licence
separately.

**Attribution needs a home in the UI.** Three of the four sources require it.
This is a legitimate exception to the glyph-only rule, in the same category as
an `aria-label`: an information glyph opening a credits panel.

### Hosting

GitHub Pages, from a public repository, with `turpin.dev` proxied through
Cloudflare. That proxy is worth knowing about: the four-hour browser cache and
the Rocket Loader script both come from Cloudflare zone settings rather than
from GitHub, and `deanturpin.github.io/gitfs/` serves the same content
unproxied, which is how to tell the two apart. Public also makes Actions free and
unlimited on standard runners, where a private repository gets 2,000 minutes a
month and a half-hourly cron would consume roughly 1,440 of them. Pages serves
range requests, so `coast.pmtiles` needs no special host.

Deploy from the Action directly via the Pages artifact rather than committing
build output, so regenerated data does not accumulate in the git history.

### Robots and etiquette

Neither issue is a licensing problem, but both affect a public project.

- The EA disallows `/doc/` and `/data/` in robots.txt, which are the
  bathing-water API paths. This is conventional practice to keep search engines
  out of large JSON document sets rather than a prohibition on API use; the data
  is published as an API for reuse under OGL.
- CCO leaves `/realtimedata/` open to all agents but explicitly blocks
  `ClaudeBot`, `GPTBot` and `AmazonBot`, indicating wariness of automated bulk
  access.

Send a descriptive User-Agent carrying a contact URL and keep the request rate
low. Better, ask CCO for access to their data catalogue's machine-readable
route: it would remove the most fragile component in the design.

## Risks

- **CCO scraping has no contract.** It is HTML that can change without notice.
  Mitigated by a staleness timestamp in the UI and a fall back to modelled data
  when a station goes quiet, so a broken scrape degrades rather than breaks.
- **GitHub Actions cron is not punctual.** It routinely fires 10 to 30 minutes
  late under load, so half-hourly buoy data may in practice be hourly. Sea
  temperature moves slowly enough for this to be acceptable, but the observation
  timestamp must be visible in the UI rather than implied.
- **Open-Meteo's free tier prohibits commercial use** — no advertising, no
  subscriptions — at 10,000 calls per day and CC-BY 4.0 attribution. This
  applies to the app regardless of whether the call originates in the browser,
  so the provider interface exists to make going commercial a swap.
- **A simplified coastline looks poor above zoom 9.** Acceptable for a
  tap-a-pin app; upgrading means clipping the full split polygons and running
  tippecanoe, which is a build step rather than a redesign.
