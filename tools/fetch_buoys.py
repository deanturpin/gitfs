#!/usr/bin/env python3
"""Build public/data/buoys.json from the Channel Coastal Observatory.

CCO publishes no API, so this parses their real-time HTML tables. Data is
Open Government Licence v3. Their robots.txt blocks several automated agents,
so requests identify themselves and are deliberately paced — do not raise the
rate without speaking to them first.

Columns are located by header name rather than by position, so an inserted
column changes nothing. A station that fails to parse is skipped and reported
rather than aborting the run: partial data beats no data, and the UI shows
staleness per station.
"""

import html
import json
import re
import sys
import time
import urllib.error
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

INDEX = "https://coastalmonitoring.org/realtimedata/"
STATION = INDEX + "?chart={}&tab=waves"
UA = "gitfs/0.1 (sea conditions for swimmers; +https://github.com/deanturpin/gitfs)"
DELAY = 0.4
OUT = Path(__file__).resolve().parent.parent / "public" / "data" / "buoys.json"

# Header text mapped onto the key we publish. Anything unlisted is ignored.
FIELDS = {
    "Time (GMT)": "time",
    "Latitude": "lat",
    "Longitude": "lon",
    "Sea Temp (°C)": "seaTemp",
    "Wave Height (m)": "waveHeight",
    "Max Wave Height (m)": "maxWaveHeight",
    "Tpeak (s)": "peakPeriod",
    "Tz (s)": "meanPeriod",
    "Peak Direction (degrees)": "peakDirection",
}


def get(url):
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=45) as r:
        return r.read().decode("utf-8", "replace")


def text(fragment):
    return html.unescape(re.sub(r"<[^>]+>", "", fragment)).strip()


def discover():
    """Station id to name, from the index page."""
    page = get(INDEX)
    found = {}
    for cid, label in re.findall(
        r'<a[^>]+href="[^"]*chart=(\d+)&(?:amp;)?tab=waves"[^>]*>(.*?)</a>', page, re.S
    ):
        name = text(label)
        if name and cid not in found:
            found[cid] = name
    return found


def parse(page):
    """Latest reading, as {key: value}, or None if the table is unreadable."""
    headers = [text(t) for t in re.findall(r"<th[^>]*>(.*?)</th>", page, re.S)]
    index = {FIELDS[h]: i for i, h in enumerate(headers) if h in FIELDS}
    if "time" not in index:
        return None

    for row in re.findall(r"<tr>(.*?)</tr>", page, re.S):
        cells = [text(c) for c in re.findall(r"<td[^>]*>(.*?)</td>", row, re.S)]
        if not cells or not re.match(r"\d{2}-\d{2}-\d{4}", cells[0]):
            continue
        if max(index.values()) >= len(cells):
            continue
        return {k: cells[i] for k, i in index.items()}
    return None


def number(value):
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def observed_at(stamp):
    """CCO stamps are GMT; emit ISO 8601 so the browser need not guess."""
    try:
        naive = datetime.strptime(stamp, "%d-%m-%Y %H:%M")
        return naive.replace(tzinfo=timezone.utc).isoformat().replace("+00:00", "Z")
    except ValueError:
        return None


def main():
    stations, failed = [], []
    for cid, name in sorted(discover().items(), key=lambda kv: kv[1]):
        try:
            reading = parse(get(STATION.format(cid)))
        except (urllib.error.URLError, TimeoutError, OSError) as exc:
            failed.append(f"{name} ({cid}): {exc}")
            continue
        finally:
            time.sleep(DELAY)

        if not reading:
            failed.append(f"{name} ({cid}): no readable table")
            continue

        lat, lon = number(reading.get("lat")), number(reading.get("lon"))
        if lat is None or lon is None:
            failed.append(f"{name} ({cid}): no position")
            continue

        stations.append(
            {
                "id": f"cco:{cid}",
                "name": name,
                "lat": lat,
                "lon": lon,
                "observedAt": observed_at(reading.get("time")),
                "seaTemp": number(reading.get("seaTemp")),
                "waveHeight": number(reading.get("waveHeight")),
                "maxWaveHeight": number(reading.get("maxWaveHeight")),
                "peakPeriod": number(reading.get("peakPeriod")),
                "meanPeriod": number(reading.get("meanPeriod")),
                "peakDirection": number(reading.get("peakDirection")),
            }
        )

    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(
        json.dumps(
            {
                "generated": datetime.now(timezone.utc)
                .isoformat(timespec="seconds")
                .replace("+00:00", "Z"),
                "source": "Channel Coastal Observatory (NNRCMP)",
                "licence": "OGL v3",
                "measured": True,
                "stations": stations,
            },
            indent=1,
        )
        + "\n"
    )

    print(f"{len(stations)} stations written to {OUT}")
    for line in failed:
        print(f"  skipped: {line}", file=sys.stderr)
    # A handful of dead stations is normal; a total wipeout means the page moved.
    return 1 if not stations else 0


if __name__ == "__main__":
    sys.exit(main())
