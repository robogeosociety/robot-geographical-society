---
name: robot-data-dev
description: Manage campsite data within the robot-geographical-society repository, including adding new campsites, updating metadata, validating schemas, and synchronizing GeoJSON.
---

# robot-data-dev

This skill manages the Washington State campsite data lifecycle. Use it when adding or modifying campsite markdown files, validating against the JSON schema, or rebuilding the data pipeline artifacts.

## Data Workflow

1. **Understand Location**: Determine the agency (blm, nps, usfs, wa-state-parks) and geographical sub-folder (e.g., `campsites/usfs/WA/Mt_Baker_Snoqualmie_NF/`).
2. **Initialize Data**:
   - Use `assets/campsite_template.md` as a starting point.
   - Ensure `name` exactly matches the directory name and file name (e.g., `Panorama_Point.md`).
   - `year_round` is **required**. If it has a seasonal window, set `year_round: false`.
3. **Validate & Build**:
   - Run `uv run generate` to validate the schema and update `campsites.json`.
4. **Update Metrics**:
   - Run `uv run update --verbose` to fetch live availability (requires `rec_gov_id` or `resource_location_id`) and calculate `quality_score`.

## Metadata Standards

| Field | Requirement | Values |
| :--- | :--- | :--- |
| `agency_short` | Required | `blm`, `nps`, `usfs`, `wa-state-parks` |
| `state` | Required | Always `WA` |
| `types` | Required | `tent`, `rv`, `walk-in`, `cabin`, `bike-in`, `parking`, `boat-in`, `group` |
| `lat`/`lng` | Required | Within WA bounds: (45.0, 49.5) / (-125.0, -116.0) |
| `year_round` | Required | `true` or `false` |

## Helper Scripts

- **Update Links**: Use `scripts/fix_links.py` to automatically deep-link `reservation_url` and `official_url` if they are currently generic agency homepages.

## Reference Materials

- **Schema**: See `references/campsite.schema.json` for full property requirements.
