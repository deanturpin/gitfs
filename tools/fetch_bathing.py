#!/usr/bin/env python3
"""Build site/data/bathing.json from the Environment Agency.

These 400-odd designated bathing waters are the app's swim spots: they are
official, carry coordinates, and come with both an annual classification and a
daily pollution risk forecast. Data is Open Government Licence v3.

Note that the risk forecast lives on the main bathing-water record as
latestRiskPrediction. The separate in-season and prf endpoints return 404 or
empty, which is misleading rather than broken — do not go looking for them.
"""

import json
import sys
import urllib.error
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

API = "https://environment.data.gov.uk/doc/bathing-water.json?_pageSize={}"
PAGE_SIZE = 1000
UA = "gitfs/0.1 (sea conditions for swimmers; +https://github.com/deanturpin/gitfs)"
OUT = Path(__file__).resolve().parent.parent / "site" / "data" / "bathing.json"


def value(node, *path):
    """Walk a linked-data record, unwrapping the _value envelopes."""
    for key in path:
        if not isinstance(node, dict):
            return None
        node = node.get(key)
    if isinstance(node, dict):
        return node.get("_value")
    return node


def main():
    req = urllib.request.Request(API.format(PAGE_SIZE), headers={"User-Agent": UA})
    try:
        with urllib.request.urlopen(req, timeout=90) as r:
            payload = json.load(r)
    except (urllib.error.URLError, TimeoutError, OSError, ValueError) as exc:
        print(f"bathing water fetch failed: {exc}", file=sys.stderr)
        return 1

    items = payload.get("result", {}).get("items", [])
    spots = []
    for item in items:
        point = item.get("samplingPoint") or {}
        lat, lon = point.get("lat"), point.get("long")
        name = value(item, "name")
        if lat is None or lon is None or not name:
            continue

        spots.append(
            {
                "id": item.get("eubwidNotation"),
                "name": name,
                "lat": lat,
                "lon": lon,
                "classification": value(
                    item, "latestComplianceAssessment", "complianceClassification", "name"
                ),
                "risk": value(item, "latestRiskPrediction", "riskLevel", "name"),
                "riskExpiresAt": value(item, "latestRiskPrediction", "expiresAt"),
                # Flags sites where rainfall is known to affect water quality,
                # which is what makes the daily forecast worth reading at all.
                "rainSensitive": item.get("waterQualityImpactedByHeavyRain"),
            }
        )

    spots.sort(key=lambda s: s["name"])
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(
        json.dumps(
            {
                "generated": datetime.now(timezone.utc)
                .isoformat(timespec="seconds")
                .replace("+00:00", "Z"),
                "source": "Environment Agency",
                "licence": "OGL v3",
                "measured": False,
                "spots": spots,
            },
            indent=1,
        )
        + "\n"
    )

    print(f"{len(spots)} bathing waters written to {OUT} (of {len(items)} returned)")
    return 0 if spots else 1


if __name__ == "__main__":
    sys.exit(main())
