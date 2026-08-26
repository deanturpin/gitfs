#!/usr/bin/env python3
"""Work out which way each bathing water faces, and record it as `aspect`.

An offshore wind flattens the water and an onshore one piles it up, which is
one of the strongest local effects there is — but it cannot be judged from wind
direction alone without knowing which way the beach faces. That is derivable
from the coastline already shipped for the basemap, so nobody has to write it
down for 464 spots.

Method: find the nearest coastline vertex, take the shoreline's direction from
its neighbours, and step a little way along each of the two perpendiculars. One
lands on land and one lands in water; the wet one is the way the beach faces.

Deciding which is seaward by testing the geometry, rather than by trusting ring
winding order, because the polygons here have been through a clip and a
reprojection and their winding is not guaranteed to have survived.
"""

import json
import math
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
COAST = ROOT / "public" / "data" / "coast.geojson"
SPOTS = ROOT / "public" / "data" / "bathing.json"

# How far to step off the shoreline when testing which side is sea, in metres.
#
# Several distances rather than one, and the answer has to hold at all of them.
# A single short probe is fooled by anything narrow: step 400 m off the bank of
# a creek and you are still over water, so the creek looks like open sea and the
# beach is recorded as facing inland. Southend, on the north bank of the Thames
# estuary, came out facing west-north-west that way when it plainly faces south
# across the water. Requiring the same side to be wet at two kilometres as well
# discards the creeks, because a creek is not two kilometres wide.
PROBE_M = (400, 1200, 2500)
CELL = 0.05            # index bucket size in degrees, about 5 km
M_PER_DEG_LAT = 111320.0


def rings(geojson):
    """Every ring in the file, as (ring, bbox)."""
    for feature in geojson["features"]:
        geometry = feature["geometry"]
        polygons = (
            [geometry["coordinates"]]
            if geometry["type"] == "Polygon"
            else geometry["coordinates"]
        )
        for polygon in polygons:
            for ring in polygon:
                if len(ring) < 4:
                    continue
                xs = [p[0] for p in ring]
                ys = [p[1] for p in ring]
                yield ring, (min(xs), min(ys), max(xs), max(ys))


def index(all_rings):
    """Bucket vertices by cell so the nearest search is not 38,000 per spot."""
    grid = {}
    for ring_id, (ring, _) in enumerate(all_rings):
        for i, (lon, lat) in enumerate(ring[:-1]):
            grid.setdefault((int(lon / CELL), int(lat / CELL)), []).append((lon, lat, ring_id, i))
    return grid


def nearest_vertex(grid, lon, lat):
    """Nearest coastline vertex, widening the search until something is found."""
    cx, cy = int(lon / CELL), int(lat / CELL)
    for reach in range(1, 8):
        found = []
        for dx in range(-reach, reach + 1):
            for dy in range(-reach, reach + 1):
                found.extend(grid.get((cx + dx, cy + dy), ()))
        if found:
            return min(found, key=lambda v: (v[0] - lon) ** 2 + (v[1] - lat) ** 2)
    return None


def inside(ring, bbox, lon, lat):
    """Ray casting, with a bounding box rejection first."""
    west, south, east, north = bbox
    if not (west <= lon <= east and south <= lat <= north):
        return False
    hit = False
    for i in range(len(ring) - 1):
        x1, y1 = ring[i]
        x2, y2 = ring[i + 1]
        if (y1 > lat) != (y2 > lat):
            x = x1 + (lat - y1) / (y2 - y1) * (x2 - x1)
            if x > lon:
                hit = not hit
    return hit


def bearing_of(dx_m, dy_m):
    """Compass bearing of a vector given in metres east and north, 0 <= b < 360."""
    return (math.degrees(math.atan2(dx_m, dy_m)) + 360) % 360


def aspect_for(spot, all_rings, grid):
    lon, lat = spot["lon"], spot["lat"]
    found = nearest_vertex(grid, lon, lat)
    if not found:
        return None
    _, _, ring_id, i = found
    ring, bbox = all_rings[ring_id]

    # The local direction of the shoreline, taken as the line between a vertex
    # a little way back and a little way on — not the two immediate neighbours.
    #
    # The coastline is a simplified polygon, so consecutive vertices can be a
    # few metres apart and sit at any angle to the general run of the shore. A
    # tangent taken across a wider span averages that out, and the beach's
    # aspect is a property of the bay rather than of one wobble in the outline.
    span = 6
    before = ring[(i - span) % (len(ring) - 1)]
    after = ring[(i + span) % (len(ring) - 1)]
    scale = math.cos(math.radians(lat))
    dx = (after[0] - before[0]) * scale * M_PER_DEG_LAT
    dy = (after[1] - before[1]) * M_PER_DEG_LAT
    length = math.hypot(dx, dy)
    if length == 0:
        return None
    dx, dy = dx / length, dy / length

    # A shoreline has two perpendiculars: one points inland, one out to sea.
    # Which is which cannot be read off the geometry — it depends on where the
    # land is — so both are tested by walking along them and asking whether the
    # end point is inside the land polygon.
    #
    # Deciding it this way rather than from the ring's winding order is
    # deliberate. GeoJSON says exterior rings run counter-clockwise, which would
    # put land reliably on one side, but these polygons have been clipped to a
    # bounding box and reprojected on the way here, and neither operation
    # promises to preserve winding. Testing the geometry cannot be wrong about
    # something the file might be lying about.
    scores = []
    for nx, ny in ((dy, -dx), (-dy, dx)):
        wet = 0
        for distance in PROBE_M:
            probe_lon = lon + (nx * distance) / (M_PER_DEG_LAT * scale)
            probe_lat = lat + (ny * distance) / M_PER_DEG_LAT
            if not inside(ring, bbox, probe_lon, probe_lat):
                wet += 1
        scores.append((wet, nx, ny))

    # The seaward side is the one that is still water when you keep walking.
    scores.sort(reverse=True)
    (best, nx, ny), (runner_up, *_) = scores
    if best == 0 or best == runner_up:
        # Either nowhere was wet — an inland lake, which has no coastline and no
        # aspect — or both sides looked equally wet, which happens on a spit or
        # a narrow island where the answer is genuinely ambiguous. Better to
        # record nothing than to record a coin toss.
        return None
    # Rounded after the modulo, not before: a bearing of 359.7 rounds to 360,
    # which is due north expressed as a number no compass uses.
    return round(bearing_of(nx, ny)) % 360


def main():
    coast = json.loads(COAST.read_text())
    data = json.loads(SPOTS.read_text())
    all_rings = list(rings(coast))
    grid = index(all_rings)

    resolved = 0
    for spot in data["spots"]:
        # The direction the beach faces, in compass degrees: the way you look
        # when standing on the sand with your back to the land.
        spot["aspect"] = aspect_for(spot, all_rings, grid)
        resolved += spot["aspect"] is not None

    SPOTS.write_text(json.dumps(data, indent=1) + "\n")
    print(f"aspect resolved for {resolved} of {len(data['spots'])} spots")
    return 0 if resolved else 1


if __name__ == "__main__":
    sys.exit(main())
