# gitfs

Sea conditions for anyone getting in the water — swimming, surfing,
paddleboarding, kayaking, diving. A map of the coast: tap a spot, see whether it
is worth getting in.

## Why

Every sea temperature site shows one satellite-derived figure and stops. That
figure is often defensible and still fails the swimmer, because it cannot
explain why 20.5 °C felt cold.

Answering that needs three things those sites omit: a *measured* reading rather
than a modelled one, the tide state at the time, and the wind chill on the way
out. So the guiding principle here is **provenance** — show measured data where
it exists, modelled data where it does not, and never let the two look alike.

## Status

Early. `PLAN.md` holds the architecture and build order; the site is a
placeholder until phase 1 lands.

## Design

Fully static, with no runtime backend. Nothing in the app is per-user or
per-request — everyone looking at a given spot wants the same buoy reading — so
a server would be a cache with a bill attached.

Live conditions are fetched from the browser straight to Open-Meteo. Sources
that send no CORS headers are not per-request data either, so a scheduled job
regenerates them into static JSON that the browser reads like any other asset.

## Licence

Code is MIT, in `LICENSE`.

Data is not. Sources carry their own terms — including ODbL share-alike on
anything derived from OpenStreetMap — and they are set out in
`ATTRIBUTION.md`. Read that before redistributing any of the data files.

Weather data by [Open-Meteo.com](https://open-meteo.com/). Contains public
sector information licensed under the Open Government Licence v3.0. Coastline
© OpenStreetMap contributors, under ODbL.
