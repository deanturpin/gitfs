# Attribution and data licences

The MIT licence in `LICENSE` covers the **code only**. Data carries its own
terms, and some of those terms are share-alike, so they are set out separately
here.

## Sources

| Source | Licence | Used for |
| --- | --- | --- |
| [Open-Meteo](https://open-meteo.com/) | [CC-BY 4.0](https://creativecommons.org/licenses/by/4.0/) | Sea temperature, waves, swell, tide curve, wind, air, UV |
| [Channel Coastal Observatory](https://coastalmonitoring.org/) (NNRCMP) | [OGL v3](https://www.nationalarchives.gov.uk/doc/open-government-licence/version/3/) | Measured sea temperature and wave height from wave buoys |
| [Environment Agency](https://environment.data.gov.uk/) | [OGL v3](https://www.nationalarchives.gov.uk/doc/open-government-licence/version/3/) | Bathing water classifications and daily pollution risk forecasts |
| [OpenStreetMap](https://www.openstreetmap.org/) via [osmdata.openstreetmap.de](https://osmdata.openstreetmap.de/) | [ODbL 1.0](https://opendatacommons.org/licenses/odbl/1-0/) | Coastline and land polygons |
| [Oswald](https://fonts.google.com/specimen/Oswald) by Vernon Adams and contributors | [SIL Open Font Licence 1.1](https://openfontlicense.org/) | The condensed face used for headings, the verdict and numbers |
| [MapLibre GL JS](https://maplibre.org/) | [BSD 3-Clause](https://github.com/maplibre/maplibre-gl-js/blob/main/LICENSE.txt) | Map rendering |

## Required notices

These must appear in the running application, not only in this file.

- Weather data by [Open-Meteo.com](https://open-meteo.com/)
- Contains public sector information licensed under the Open Government
  Licence v3.0. Wave buoy data from the National Network of Regional Coastal
  Monitoring Programmes. Bathing water data © Environment Agency copyright
  and database right.
- Coastline data © OpenStreetMap contributors, available under the Open
  Database Licence.
- Oswald is used under the SIL Open Font Licence and is self-hosted in
  `public/vendor/fonts`, so the app makes no third-party request and works
  offline.

## ODbL share-alike

Anything in this repository derived from OpenStreetMap — including a clipped or
simplified coastline — is a *derived database* and remains under ODbL 1.0
regardless of the MIT licence on the code. If you redistribute those files, or
a database built from them, you must do so under ODbL and keep the attribution
above.

## A note on the free Open-Meteo tier

Open-Meteo licenses its data and its service separately. The **data** is
CC-BY 4.0 and permits commercial use. The **free API service** separately
prohibits advertising and subscriptions. This project uses the free service, so
adding either would require a paid plan — not a change of licence.

## Courtesy

The Environment Agency and CCO endpoints are polled on a schedule, not per
request. Requests carry a descriptive User-Agent with a contact URL, and the
rate is kept deliberately low. CCO blocks several automated agents in their
`robots.txt`; please do not raise the polling frequency without speaking to
them first.
