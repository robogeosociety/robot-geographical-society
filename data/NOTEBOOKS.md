# Jupyter Notebook Operations

## Starting the server

Always launch from the **project root** (`robot-geographical-society/`), not from `data/`:

```bash
cd /Users/tommydoerr/dev/robot-geographical-society
uv run --project data jupyter notebook \
  --no-browser \
  --ip=0.0.0.0 \
  --ServerApp.password='argon2:$argon2id$v=19$m=10240,t=10,p=8$+SyoDRzfMuDouwfYkxjM/w$aUq4FoD50I4NBp3oKMBawGjFkHfFjwLyf9xsKnLEOBg' \
  data/sync_campsites.ipynb
```

- Password: `booknote`
- Run in background with `run_in_background=true`; wait ~4s then grep output for "running at"

## Access URLs

**Always use the hostname — `127.0.0.1` does not work (Termius/mobile):**

| Purpose | URL |
|---|---|
| File browser | `http://Tommys-Mac-mini.local:8888/tree` |
| Sync notebook | `http://Tommys-Mac-mini.local:8888/notebooks/sync_campsites.ipynb` |

## Stopping the server

```bash
kill $(lsof -ti :8888)
```

## Notebooks

### `data/sync_campsites.ipynb`

Validates all `index.md` files and rebuilds `campsites.json`. Cell order:

1. Imports
2. Setup (`BASE`, `OUTPUT`, constants)
3. **Output Location** — `ipyfilechooser` widget; run cell to get clickable file browser, sets `OUTPUT` on selection
4. Parse & validate all `index.md` files (halts on errors)
5. Build GeoJSON features and write to `OUTPUT`

The `sync()` function in `campsite_sync/sync.py` is the modular equivalent and can be called headlessly via `uv run sync-to-geojson [--output FILE]`.

## Widget notes

- `ipywidgets` / `ipyfilechooser` cells render as source code until executed in a live kernel — this is normal
- The `FileChooser` widget (cell `krrp0ur63ue`) pre-fills to the default output path; click to browse and select a different location before running Step 2
