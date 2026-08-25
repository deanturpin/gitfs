# CLAUDE.md

Guidance for Claude Code working in this repository.

## Project overview

`gitfs` is a map-based sea conditions app for swimmers and other sea goers.
Read `PLAN.md` first — it holds the architecture, the build order and the
reasoning behind both.

The name stands for what you think it stands for, and it does useful work: the
name carries the tone so the UI does not have to. Keep the interface wordless.

## Architecture

**Fully static. There is no runtime backend, and adding one needs a reason.**
Nothing in the app is per-user or per-request, so a server would only be a
cache with a bill attached.

- Live conditions go straight from the browser to Open-Meteo, which sends
  `access-control-allow-origin: *`.
- Sources without CORS headers are regenerated into static JSON on a schedule
  by GitHub Actions and served as ordinary assets.
- The deployable site is everything under `site/`. The Pages workflow uploads
  that directory and nothing else.

## Gotchas

These cost real time to discover. Do not rediscover them.

- **Open-Meteo's sea surface temperature is not from the wave models.**
  Requesting it with an explicit `models=` parameter returns null. It comes
  from a separate, coarser analysis product, which is exactly why a measured
  buoy reading is the headline wherever one exists.
- **The marine API snaps to a coarse grid.** Every Brighton coordinate resolves
  to one cell roughly 3 km offshore. Do not assume the returned lat/lon matches
  what was asked for; check it.
- **Tides come free.** `sea_level_height_msl` on the marine endpoint gives an
  hourly tidal curve, so no separate tide API is needed to tell high from low.
- **The Environment Agency's risk forecast is nested in the main record.** Use
  `latestRiskPrediction` on the `bathing-water` object. The separate in-season
  and `prf` endpoints return 404 or empty, which is misleading rather than
  broken. `samplingPoint` carries lat and long, so the spot catalogue is
  generated, never hand-built.
- **The bathing water catalogue is England only.** All 464 sites come from the
  Environment Agency, which does not cover Wales, Scotland or Northern Ireland.
  The CCO buoys do reach Wales, so parts of the map have measurements and no
  spots. Do not describe the coverage as UK-wide.
- **CCO has no API.** 53 buoy stations, HTML only, at
  `coastalmonitoring.org/realtimedata/?chart=<id>&tab=waves`. Their robots.txt
  blocks several automated agents, so send a descriptive User-Agent with a
  contact URL and keep the rate low. Getting an official machine-readable route
  from them would remove the most fragile part of the design.
- **Cloudflare, not GitHub, sits in front of the site.** `turpin.dev` is
  proxied through Cloudflare, so zone settings apply to everything served
  there. `deanturpin.github.io/gitfs/` is the same content unproxied, which
  makes it the way to tell a Cloudflare behaviour from a GitHub one.
- **The four-hour browser cache is Cloudflare's.** `turpin.dev` returns
  `cache-control: max-age=14400`; the same file from `github.io` carries no
  cache-control at all. It is Cloudflare's default Browser Cache TTL and is a
  dashboard setting, not a platform limit — do not repeat the claim that it
  cannot be changed. The generated data files are fetched with
  `cache: 'no-cache'` regardless, which revalidates and costs only a 304, and
  local imports are versioned at deploy so a stale cache cannot serve a
  mismatched module graph. Verify a deploy with a cache-busting query string.
- **Rocket Loader is enabled on the zone.** It injects a preload and defers
  scripts, which suits ES modules badly. `data-cfasync="false"` on the module
  script opts out.
- **GitHub Actions cron is not punctual.** It routinely fires 10 to 30 minutes
  late, so half-hourly buoy data may in practice be hourly. Always surface the
  observation timestamp rather than implying freshness.

## Rules

- **Numbers are the content, and numbers need no translating.** Controls are
  glyphs. Words survive only as `aria-label`s and in the credits panel.
- **Never show a combined score without letting it expand** into the values
  that produced it. An unexplained number gets distrusted and the app gets
  abandoned.
- **Surface staleness.** A buoy that stopped reporting must look different from
  one reading a steady figure.
- **Every metric carries its provenance** — `{ value, unit, source, measured,
  observedAt }`. Measured and modelled must never render identically.
- **Upstream calls sit behind a provider interface.** Open-Meteo's free service
  prohibits advertising and subscriptions, so swapping providers must be a
  config change.

## Licensing

Code is MIT. Data is not — see `ATTRIBUTION.md`. Anything derived from
OpenStreetMap, including a clipped coastline, stays ODbL share-alike whatever
the code licence says. Three of the four sources require attribution in the
running app, not merely in a file.

## Commands

There is no build step yet. `site/` is served as-is.

- `markdownlint *.md` — lint before committing; tables are exempt from the line
  length rule via `.markdownlint.json`.

## Notes

- No `.env.example`: every data source is keyless, so there are no secrets.
- British English throughout.
