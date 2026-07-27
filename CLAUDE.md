# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

**robot-geographical-society** is a robotic trip planner for human adventure — a modern, computer-driven equivalent of the Royal Geographical Society, focused on helping users discover and reserve campsites across Washington State Parks, USFS, and the National Park Service.

### Core Features (Functional Prototype)
- **Map interface** built on Mapbox GL JS showing campsites currently open for reservation
- **Static JSON dataset** of all campsites with metadata (site count, parameters, links)
- **Cloudflare availability collector** banking daily per-site, per-date snapshots to the `campsite-raw` R2 bucket
- **Rich popups** per campsite: site count, site types (RV/tent/bike-in/parking), ICS calendar links, and links to official pages


## Tooling

- **Frontend:** `web/` — React + Vite + Mapbox GL JS
  - `npm run dev` — local dev server
  - `npm test -- --run` — run tests (Vitest)
  - `npm run lint` — ESLint
  - `npm run build` — production build
- **Campsite data:** `data/campsites.json` — GeoJSON FeatureCollection

## Terminology — campground vs campsite (standardized)

Use these terms consistently across code, UI, and docs. They follow the federal
rec.gov / RIDB convention (the authoritative model shared by USFS, NPS, BLM, USACE);
WA goingtocamp's `resourceLocation`/`mapId`/`resource` are **aliased onto them at the
collector's ingestion boundary**.

| Term | Meaning | Example | Provider sources |
| --- | --- | --- | --- |
| **campground** | The bookable place as a whole. | *Middle Fork* | RIDB `Facility`; rec.gov availability `campground`; WA `resourceLocation` |
| **loop** | A named sub-grouping of campsites within a campground. | *Middle Fork — Riverbend* | rec.gov availability `loop`; WA `mapId`/map (null until enriched) |
| **campsite** | An individual reservable unit; its number/label is the **`site`**. | *Middle Fork #24* (campsite, `site`=24) | RIDB `Campsite`/`CampsiteID`; rec.gov `campsite_id` + `site`; WA `resource`/`resourceId` |

- "campground" is preferred over RIDB's formal "facility" (it's the public + availability-API word and matches existing code/R2 keys).
- A bare "site" means the **campsite's number/label** (e.g. `label`/`site` = "24"), not the place. Avoid the ambiguous bare "site" for the place — say "campground".
- The R2 `sites/<id>.json` key and the `siteId` field are the **internal** unit id (e.g. `81835`); the human label (`#24`) is `label`. (Existing field names like `siteId`/`label` are kept; the glossary governs prose, UI copy, and new identifiers.)

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

## Campsite data sync

`backend/src/campsites-index.json` is the **authoritative campsite inventory**
(collector fleet + `collect: false` map-only extras; each entry carries a stable
cross-agency `guid`). `data/campsites.json` is the derived GeoJSON the map imports —
regenerate it with `node scripts/sync-geojson.js` (or `uv run doit geojson` from
`data/`). The inventory's editorial metadata is enriched from the Obsidian **camping**
vault by the obsidian-automations `campsite_inventory` doit task. Availability is
collected by the Cloudflare collector (see the "Availability data" section above).
Full context: `data/CLAUDE.md`.

## Campsite codex (the `/codex` viewer)

`data/campsite-codex.db` is a **SQLite export of the Obsidian camping vault** — 192
campground articles and 9,205 per-campsite notes as Markdown, in two tables
(`codex_campground`, `codex_site`). The vault evicted that corpus; the SQLite store is
now its canonical home, and a copy ships into this repo as a build input beside
`data/campsites.json`. It is the **only** committed `*.db` under `data/` (see that
directory's `.gitignore`).

`web/scripts/build-codex.js` derives static JSON from it into `web/public/codex-data/`
(gitignored) — an index of campground metadata plus, per campground, one article file
and one site-bodies file. Markdown is parsed to a JSON AST at build time
(`web/src/codex/markdown.js`) and rendered as React elements, so no vault prose is ever
passed through `dangerouslySetInnerHTML`. `[[wikilinks]]` resolve to `/codex/<slug>`
only when the target is a campground the artifact carries; everything else renders as
plain text, never a dead link.

```bash
cd web
npm run codex            # derive from data/campsite-codex.db (no-op + honest empty
                         # state when the artifact is absent; also runs as prebuild)
npm run codex:fixture    # build a small fixture db + derive from it, for local dev
```

The viewer is `web/src/codex/` at `/codex`, `/codex/:slug`, `/codex/:slug/site/:site`.
It is the one route that does **not** mount the Mapbox shell — `web/src/Root.jsx`
switches between the map cockpit and the codex reading surface. Requires Node ≥ 22.5
(built-in `node:sqlite`) to build the artifact; everything downstream is plain JSON.

## Pull request descriptions

PR descriptions follow the "newspaper / information-pyramid" framework vendored at
**[`.github/pr-framework/`](.github/pr-framework/)** — a single Wired-style panel
(kicker → headline → dek → masthead → narrative lede → punchy sections → vertical mermaid
/ linked figures → checkpoint task list → verification → risk) that fits **1–2 iPad-mini
pages** (4 for very complex code changes). Build the body to `PR_FRAMEWORK.md`, validate
with `python3 .github/pr-framework/validate_pr.py <body.md>`, then `gh pr edit
--body-file`. **Regenerate the whole description from the full diff** on every push and on
readability feedback — never append. The PR **title mirrors the headline, prefixed with
the change type** (e.g. `feat: …`). This repo is **private**, so link committed figures
by their `blob/<sha>/…` URL rather than embedding (inline images need user-attachments).

## Development Protocol

See **[ISSUES.md](./ISSUES.md)** for the full issue lifecycle protocol (workspace isolation, verification steps, PR process, and deployment).
## Pull requests — the "newspaper" framework

PR descriptions follow the **newspaper / information-pyramid** format: one self-contained
front page (kicker → headline → dek → masthead → why → what → mermaid flow → screens →
verification → risk) that reads top-to-bottom on an iPad-mini portrait display (1–2 pages;
up to 4 for very complex *code* changes). Rebuild from the **full** diff, never append.
Full rules: <https://github.com/robogeosociety/.github/blob/main/PR_FRAMEWORK.md>. CI validates
the body via the `pr-newspaper` workflow (the reusable gate in `robogeosociety/pr-newspaper`).
