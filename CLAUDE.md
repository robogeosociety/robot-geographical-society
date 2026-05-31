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

## Jupyter Notebook (campsite data sync)

The data sync notebook lives at `data/sync_campsites.ipynb` and runs via `uv` with the `data/` project.

- **Port:** 8888
- **Launch:** `uv run --project data jupyter notebook --no-browser --ip=0.0.0.0 --ServerApp.password='argon2:$argon2id$v=19$m=10240,t=10,p=8$+SyoDRzfMuDouwfYkxjM/w$aUq4FoD50I4NBp3oKMBawGjFkHfFjwLyf9xsKnLEOBg' data/sync_campsites.ipynb`
- **Password:** `booknote`
- **Context:** See `data/NOTEBOOKS.md` for full details

## Development Protocol

See **[ISSUES.md](./ISSUES.md)** for the full issue lifecycle protocol (workspace isolation, verification steps, PR process, and deployment).
