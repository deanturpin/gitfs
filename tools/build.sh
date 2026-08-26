#!/usr/bin/env bash
# Everything that has to happen between a checkout and a deployable public/.
#
# One script rather than a list of steps in a workflow, because there are now
# two things that build this: GitHub Actions, and Cloudflare Pages. A build
# defined in one of them would silently skip the other — Cloudflare serving
# public/ straight from the repository would ship the __COMMIT__ placeholder
# unsubstituted and every import unversioned, which is not obviously broken
# until somebody's cache serves them a mismatched module graph.
#
# Safe to run locally: it only writes into public/.
set -uo pipefail

cd "$(dirname "${BASH_SOURCE[0]}")/.."

# Whichever builder is running, take its commit. Cloudflare and GitHub name it
# differently, and locally there is git.
COMMIT="${CF_PAGES_COMMIT_SHA:-${GITHUB_SHA:-$(git rev-parse HEAD 2>/dev/null || echo unknown)}}"
SHORT="${COMMIT:0:7}"
echo "building at $SHORT"

# Data first. A source having a moment must not take the deploy down with it —
# the committed copy ships instead, and every reading carries its own age.
python3 tools/fetch_buoys.py || echo "WARNING: buoy refresh failed, shipping committed data"
python3 tools/fetch_bathing.py || echo "WARNING: bathing refresh failed, shipping committed data"

# The Environment Agency's pollution forecast expires each morning, so a
# fallback that never ends is rot rather than resilience.
python3 - <<'CHECK' || exit 1
import json, sys
from datetime import datetime, timezone
data = json.load(open('public/data/bathing.json'))
age = datetime.now(timezone.utc) - datetime.fromisoformat(data['generated'].replace('Z', '+00:00'))
print(f"bathing water data is {age.days}d {age.seconds // 3600}h old")
if age.days >= 3:
    print("ERROR: bathing water data is more than three days old; run `make bathing`")
    sys.exit(1)
CHECK

# fetch_bathing rewrites the catalogue from an API that has no aspect field, so
# this has to come after it or every beach loses which way it faces.
python3 tools/shore_aspect.py || echo "WARNING: aspect derivation failed, wind direction will be ignored"

# Stamp the commit onto local imports, so a half-expired cache cannot serve a
# fresh app.js against a stale providers.js.
python3 tools/version_assets.py "$SHORT"

grep -q "__COMMIT__" public/index.html || {
  echo "ERROR: __COMMIT__ placeholder missing from public/index.html"
  exit 1
}
sed -i.bak "s/__COMMIT__/$SHORT/g" public/index.html && rm -f public/index.html.bak

echo "public/ is ready"
