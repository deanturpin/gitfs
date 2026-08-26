#!/usr/bin/env python3
"""Stamp a version onto local assets so a deploy cannot be half-applied.

GitHub Pages serves everything with a four-hour max-age and will not be argued
with. Different files therefore fall out of cache at different times, and a
fresh app.js against a cached providers.js is not merely stale — it throws
"does not provide an export named ..." and the app does not start at all.

Appending the commit to each local import makes a new app.js request URLs its
cached predecessors never used, so a new deploy always pulls a matching set.

Vendor modules are deliberately left alone. MapLibre derives its worker's URL
from its own at runtime, and a query string on that path risks breaking the
derivation for no benefit — the vendored files only change when the dependency
is deliberately bumped.

Usage: version_assets.py <version>
"""

import re
import sys
from pathlib import Path

SITE = Path(__file__).resolve().parent.parent / "public"


def main():
    if len(sys.argv) != 2 or not sys.argv[1].strip():
        print("usage: version_assets.py <version>", file=sys.stderr)
        return 2
    version = sys.argv[1].strip()
    changed = 0

    # Local ES module imports: from './providers.js' -> './providers.js?v=abc1234'
    for module in SITE.glob("*.js"):
        text = module.read_text()
        stamped = re.sub(
            r"""(from\s*['"])(\./[A-Za-z0-9_-]+\.js)(['"])""",
            lambda m: f"{m.group(1)}{m.group(2)}?v={version}{m.group(3)}",
            text,
        )
        if stamped != text:
            module.write_text(stamped)
            changed += 1
            print(f"  versioned imports in {module.name}")

    # The entry points named by the page.
    index = SITE / "index.html"
    html = index.read_text()
    stamped = html
    for pattern in (r'(src=")(app\.js)(")', r'(href=")(style\.css)(")'):
        stamped = re.sub(
            pattern, lambda m: f"{m.group(1)}{m.group(2)}?v={version}{m.group(3)}", stamped
        )
    if stamped != html:
        index.write_text(stamped)
        changed += 1
        print("  versioned entry points in index.html")

    if not changed:
        print("nothing to version — has the markup changed?", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
