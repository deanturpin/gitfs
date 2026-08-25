#!/usr/bin/env bash
# Rebuild site/data/coast.geojson from OpenStreetMap land polygons.
#
# Rarely needed — coastlines do not move, and the upstream file is rebuilt
# daily only to repair breaks in the OSM coastline. Output is ODbL; see
# ATTRIBUTION.md before redistributing it.
#
# The simplified set is used deliberately. It is good to about zoom 9, which
# suits a tap-a-pin app, and clips to roughly 750KB for these bounds. For
# closer zoom, switch to land-polygons-split-4326 and run the result through
# tippecanoe into pmtiles instead.
set -euo pipefail

BBOX="${BBOX:--11,49.5,2.2,61}"          # Britain, Ireland and Shetland
SRC="simplified-land-polygons-complete-3857"
URL="https://osmdata.openstreetmap.de/download/${SRC}.zip"
OUT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)/site/data/coast.geojson"
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

echo "downloading ${SRC} (~24MB)"
curl -fsSL --max-time 600 "$URL" -o "$WORK/lp.zip"
unzip -qo "$WORK/lp.zip" -d "$WORK"

SHP="$(find "$WORK" -name '*.shp' | head -1)"
[ -n "$SHP" ] || { echo "no shapefile found in archive" >&2; exit 1; }

echo "clipping to ${BBOX} and reprojecting to WGS84"
npx -y mapshaper "$SHP" \
  -proj wgs84 \
  -clip "bbox=${BBOX}" \
  -o format=geojson precision=0.0001 "$OUT"

echo "wrote $OUT ($(wc -c <"$OUT") bytes)"
