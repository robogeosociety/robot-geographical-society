# Campsite Data — Claude Context

This file instructs Claude Code on how to work with campsite data in this project.

> **Availability** (per-site, per-date) is collected by the Cloudflare collector
> (`backend/`) into the `campsite-raw` R2 bucket — not here. This directory only
> **derives** the map GeoJSON from the inventory.

## Source of truth

`backend/src/campsites-index.json` is the **authoritative inventory** — the
collector fleet (`collect` ≠ false) plus map-only extras (`collect: false`: BLM,
non-reservable, or disabled collectors). Each entry has the collector spine
(`id, kind, ref, name, agency`, never hand-edited) plus a stable cross-agency
`guid` and enriched geo/editorial fields.

The inventory is maintained by the **obsidian-automations** `campsite_inventory`
doit task: it reads the editorial markdown in the Obsidian **camping** vault
(`Campsites/*.md`) and writes the enriched inventory. Edit campsite metadata in
the vault, not here.

`data/campsites.json` is a **derived artifact** — regenerate, never hand-edit:

```bash
uv run doit geojson              # from data/  (backend/src/campsites-index.json → campsites.json)
# or, from the repo root:  node scripts/sync-geojson.js
```

## Deriving the GeoJSON

`build_geojson.py` (run via the `geojson` doit task) projects every inventory
entry into a STAC-Item-shaped Feature. `collect: false` entries still render
(with `properties.collected = false`); only the collector skips them. The feature
`id` is the slug (`{agency_short}/{name-slug}`) — the KV key the `/campsite/:id`
API uses; `properties.guid` is the canonical cross-agency id.

## Adding a campsite

1. Find new rec.gov candidates: `uv run crawl` (prints inventory stubs).
2. Paste the chosen stub(s) into `backend/src/campsites-index.json`
   (`{id, kind, ref, name, agency}`; add `"collect": false` for map-only sites).
3. Ensure the campsite has a note in the Obsidian camping `Campsites/` vault
   (with `lat`, `lng`, `types`, `reservation_url`, etc.).
4. Enrich + derive:
   `uv run doit campsite_inventory` (obsidian-automations) → `uv run doit geojson` (here).
5. Verify the pin at `http://localhost:5173`.

## Tooling that lives here
- `build_geojson.py` / `dodo.py` — the inventory → GeoJSON derivation.
- `campsite_sync/{rec_gov,wa_state_parks}.py` — recreation.gov / WA State Parks
  API clients used by `crawl` (and the vendored `robot-data-dev` skill).
- `scripts/crawl_rec_gov.py` — read-only discovery (`crawl`).
