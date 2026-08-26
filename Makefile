.PHONY: all help serve stop data buoys bathing aspect coast og test smoke lint clean deploy

PORT ?= 8765

all: help

help:
	@echo "gitfs — sea conditions for swimmers, surfers, paddlers and divers"
	@echo ""
	@echo "  make serve     Serve on http://localhost:$(PORT)"
	@echo "                 No build step: site/ is served exactly as Pages serves it"
	@echo "  make stop      Stop a server holding port $(PORT)"
	@echo "  make test      Validate the map style and the generated data"
	@echo "  make smoke     Load the page in a browser and fail on any error"
	@echo "  make data      Refresh buoy readings and bathing water forecasts"
	@echo "  make coast     Rebuild the coastline from OpenStreetMap (slow, 24MB)"
	@echo "  make og        Rerender the link preview card to site/og.png"
	@echo "  make lint      Lint the markdown"
	@echo ""
	@echo "  make deploy M=\"what changed and why\""

# Python's server sends the right MIME type for .mjs, which matters because
# MapLibre v6 is ESM-only and a wrong type fails the import with an error that
# blames the module rather than the server.
serve: stop
	@echo "serving site/ on http://localhost:$(PORT)"
	@cd site && python3 -m http.server $(PORT)

stop:
	@pkill -f "http.server $(PORT)" 2>/dev/null && echo "stopped server on $(PORT)" || true

# Validates the style against the MapLibre spec. A layer naming a missing
# source draws nothing rather than throwing, and on a map of the sea that
# looks exactly like open water.
test:
	@node --test

# The data files are generated, so a blank map can mean either a broken script
# or a broken page. This tells them apart by loading the real thing.
# Depends on stop, and waits for the server to actually answer rather than
# sleeping a fixed two seconds. A smoke test that fails intermittently is worse
# than none, because it teaches you to ignore it.
smoke: stop
	@cd site && python3 -m http.server $(PORT) >/dev/null 2>&1 & \
	  for i in $$(seq 1 30); do \
	    curl -sf -o /dev/null http://localhost:$(PORT)/ && break; \
	    sleep 0.3; \
	  done; \
	  status=0; node scripts/smoke.mjs / || status=1; \
	  pkill -f "http.server $(PORT)" 2>/dev/null; exit $$status

data: buoys bathing aspect

# 53 station pages at a deliberately polite rate, so about a minute. Stations
# without a position are skipped and reported rather than failing the run.
buoys:
	@python3 tools/fetch_buoys.py

bathing:
	@python3 tools/fetch_bathing.py

# Which way each beach faces, derived from the coastline rather than written
# down 464 times. Depends on bathing.json existing, so it runs after it.
aspect:
	@python3 tools/shore_aspect.py

# Rarely needed: coastlines do not move.
coast:
	@bash tools/build_coastline.sh

# Chrome rather than an image library because the card is mostly type, and it is
# a static page, so the screenshot is reliable in a way it is not for the app
# itself — which needs WebGL that headless Chrome does not have.
CHROME ?= /Applications/Google Chrome.app/Contents/MacOS/Google Chrome
og:
	"$(CHROME)" --headless=new --disable-gpu --hide-scrollbars --no-sandbox \
	  --window-size=1200,630 --default-background-color=06283d \
	  --screenshot=site/og.png "file://$(PWD)/tools/og-card.html"
	@echo "site/og.png rerendered"

lint:
	@npx markdownlint-cli *.md

clean:
	@rm -f site/data/*.json site/data/coast.geojson

# Commit message is required — never generate a generic one.
deploy:
ifndef M
	$(error Commit message required: make deploy M="what changed and why")
endif
	git add -A
	git commit -m "$(M)"
	git push
