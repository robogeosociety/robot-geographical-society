# 🏕️ Campsite Data Management

This directory serves as the source of truth for campsite information across Washington State, covering BLM, NPS, USFS, and Washington State Parks.

## 🏗️ Architecture

- **Source of Truth**: Individual Markdown files (`data/{agency}/WA/{name}/index.md`).
- **Derived Artifact**: `data/campsites.json` (GeoJSON).
- **Automation**: Jupyter notebook (`sync_campsites.ipynb`) for validation and GeoJSON generation.

## 🚀 Key Workflows

### 1. Adding a Campsite
- Create directory: `data/{agency_short}/WA/{optional-park}/{Campsite Name}/`.
- Create `index.md` with YAML frontmatter (see [CLAUDE.md](./CLAUDE.md) for schema).
- Run sync command (see below).

### 2. Updating Data
- Edit the relevant `index.md` fields.
- Run the sync notebook to regenerate `campsites.json`.

### 3. Syncing GeoJSON
Run the following command to validate markdown files and update the GeoJSON:
```bash
uv run --project data jupyter nbconvert --to notebook --inplace --execute data/sync_campsites.ipynb
```

## 📋 Schema Highlights

- **Required Fields**: `name`, `agency`, `agency_short`, `state` (always "WA"), `lat`, `lng`, `sites`, `types`, `reservable`, `year_round`, `reservation_url`, `official_url`.
- **Types**: `tent`, `rv`, `walk-in`, `cabin`, `bike-in`, `parking`.
- **Dates**: Use "Month Day" format (e.g., "May 1"). Use `null` if not applicable.

## 🛠️ Validation Checklist
- `lat`/`lng` within WA bounds (Lat: 45.5–49.0, Lng: -124.9 to -116.9).
- `name` matches directory name exactly.
- `official_url` points directly to the campground page.
- Notes body is concise (1-2 sentences).

---
*Last Updated: February 2026*
