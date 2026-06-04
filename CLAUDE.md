# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

**robot-geographical-society** is a robotic trip planner for human adventure — a modern, computer-driven equivalent of the Royal Geographical Society, focused on helping users discover and reserve campsites across Washington State Parks, USFS, and the National Park Service.

### Core Features (Functional Prototype)
- **Map interface** built on Mapbox GL JS showing campsites currently open for reservation
- **Static JSON dataset** of all campsites with metadata (site count, parameters, links)
- **Static RSS feed** of reservation opening dates for tracked campsites (year-round sites excluded)
- **Rich popups** per campsite: site count, site types (RV/tent/bike-in/parking), ICS calendar links, and links to official pages


## Tooling

- **Frontend:** `web/` — React + Vite + Mapbox GL JS
  - `npm run dev` — local dev server
  - `npm test -- --run` — run tests (Vitest)
  - `npm run lint` — ESLint
  - `npm run build` — production build
- **Campsite data:** `data/campsites.json` — GeoJSON FeatureCollection

## Availability data (per-site, per-date)

The collector (`backend/`) banks daily availability snapshots to the `campsite-raw` R2 bucket. Three objects per campground per collection day, **keyed by provider id** — rec.gov campground id (e.g. `233864`) or WA goingtocamp resourceLocation id (negative, e.g. `-2147483476`); **not** the `usfs/…`/`wa/…` slug from `campsites.json`:

- `raw/<date>/<agency>/<id>.json` — untouched upstream payload (audit)
- `summary/<date>/<id>.json` — campground rollup: `by_date → {available, reserved, total}`
- `sites/<date>/<id>.json` — **per individual site**: `sites[siteId] → {label, loop, type, use, by_date}`, where `by_date["YYYY-MM-DD"]` is `"available" | "reserved" | "other"`

"Remaining availability by site and date" is therefore a direct lookup in `sites/`. The `sites/` shape is normalized identically across rec.gov and WA. Caveats (verified against live R2, 2026-06):

- **Daily granularity** — one status per night. Booking velocity = diff successive daily snapshots.
- **Staleness ≤ ~2 days** — the collector refreshes one site per wake across the freshness window, so any one campground may be 1–2 days behind.
- **WA leaves `type`/`use` null** (rec.gov populates them); `loop` is enriched from the goingtocamp maps API, `label` from the resources API.
- **Window length varies by source** — seasonal USFS sites end at season close (~Sept); WA runs the full ~6 months forward.
- **`"other"`** = neither bookable nor a confirmed reservation (not-yet-released / not-reservable); seen on rec.gov.
- Quarantined sites live in `dlq/<id>.json` and stop collecting until reactivated.

Collection owns → R2; the `observability` repo owns R2 → InfluxDB → Grafana. See `backend/README.md`.

## Jupyter Notebook (campsite data sync)

The data sync notebook lives at `data/sync_campsites.ipynb` and runs via `uv` with the `data/` project.

- **Port:** 8888
- **Launch:** `uv run --project data jupyter notebook --no-browser --ip=0.0.0.0 --ServerApp.password='argon2:$argon2id$v=19$m=10240,t=10,p=8$+SyoDRzfMuDouwfYkxjM/w$aUq4FoD50I4NBp3oKMBawGjFkHfFjwLyf9xsKnLEOBg' data/sync_campsites.ipynb`
- **Password:** `booknote`
- **Context:** See `data/NOTEBOOKS.md` for full details

## Development Protocol

See **[ISSUES.md](./ISSUES.md)** for the full issue lifecycle protocol (workspace isolation, verification steps, PR process, and deployment).
