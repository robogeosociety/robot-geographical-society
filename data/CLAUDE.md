# Campsite Data — Claude Context

This file instructs Claude Code on how to work with campsite data in this project.

> **Availability** (per-site, per-date) is collected by the Cloudflare collector
> (`backend/`) into the `campsite-raw` R2 bucket — not synced here. This pipeline
> only compiles campsite **metadata** into the map's GeoJSON.

## Source of truth

Individual campsite files (`data/{agency}/WA/{name}/index.md` or `data/{agency}/WA/{park}/{name}/index.md`) are the **source of truth**. The GeoJSON (`data/campsites.json`) is a **derived artifact** — regenerate it from the markdown files, never edit it directly.

To sync after any edits (validates first, halts on any error, then writes `campsites.json`):
```bash
node scripts/sync-geojson.js     # from the repo root
# or, from data/:  uv run refresh run
```

---

## Directory structure

```
data/
  blm/WA/{Campsite Name}/index.md
  nps/WA/{Park Name}/{Campsite Name}/index.md
  usfs/WA/{Forest Name}/{Campsite Name}/index.md
  wa-state-parks/WA/{Park Name}/index.md
```

Directory names are human-readable and match the `name` field. Use title case with spaces — no slugs.

---

## Schema

Each `index.md` has YAML frontmatter followed by a plain-text notes body.

```yaml
---
name: Heart O' the Hills          # string, required — must match directory name
agency: National Park Service      # string, required — full agency name
agency_short: nps                  # string, required — one of: blm | nps | usfs | wa-state-parks
state: WA                          # string, required — always WA for now
lat: 47.9813                       # float, required — WGS84 decimal degrees
lng: -123.4318                     # float, required — WGS84 decimal degrees
sites: 105                         # integer, required — total number of campsites
types: [tent, rv]                  # array, required — see valid values below
reservable: true                   # boolean, required
year_round: false                  # boolean, required
open_date: "May 1"                 # string or null — "Month Day" format; null if year_round: true
first_reservation_date: null       # string or null — "Month Day" format, e.g. "February 1"
reservation_url: https://...       # string, required — booking/info system URL
official_url: https://...          # string, required — authoritative agency page for this campsite
---

Plain-text description of the campsite. One or two sentences.
```

### Valid `types` values

| Value | Meaning |
|---|---|
| `tent` | Standard tent sites |
| `rv` | RV/trailer hookup or pull-through sites |
| `walk-in` | Walk-in or hike-in tent sites |
| `cabin` | Cabins or yurts |
| `bike-in` | Bike-in sites |
| `parking` | Parking lot / car-camping style |

### `open_date` format

- Year-round sites: `open_date: null`
- Seasonal sites: `open_date: "Month 1"` — use full month name + day 1, e.g. `"May 1"`, `"July 1"`
- Update to a specific date if known, e.g. `"May 23"` for a confirmed opening

### `first_reservation_date`

The date reservations open (often months before `open_date`). Leave `null` until confirmed from the booking system. Format same as `open_date`: `"February 1"`.

### `official_url`

Link directly to the campground page on the agency website, not the homepage. Examples:
- recreation.gov: `https://www.recreation.gov/camping/campgrounds/234429`
- WA State Parks: `https://washington.goingtocamp.com/campingworld/searchavailability?mapId=-2147483508`
- BLM: specific district page URL

---

## Adding a new campsite

1. Create the directory: `data/{agency_short}/WA/{optional-park}/{Campsite Name}/`
2. Copy the schema above into `index.md` and fill in all required fields
3. Run `node scripts/sync-geojson.js` to regenerate the GeoJSON
4. Verify the new pin appears on the map at `http://localhost:5173`

## Updating existing data

1. Edit the relevant `index.md` field(s)
2. Run `node scripts/sync-geojson.js` to regenerate the GeoJSON
3. Commit both the `index.md` change and the updated `data/campsites.json`

## Validation checklist

Before committing, verify:
- [ ] `lat`/`lng` are plausible for Washington State (lat: 45.5–49.0, lng: -124.9 to -116.9)
- [ ] `types` contains only valid values from the table above
- [ ] `open_date` is `null` when `year_round: true`
- [ ] `reservation_url` and `official_url` are valid URLs (not placeholder `https://www.blm.gov/`)
- [ ] `name` matches the directory name exactly
- [ ] Notes body is a single concise sentence or two (no markdown formatting)
