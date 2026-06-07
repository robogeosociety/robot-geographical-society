"""Derive the map GeoJSON from the authoritative campsite inventory.

`backend/src/campsites-index.json` is the source of truth (the collector fleet +
map-only extras, enriched from the Obsidian camping vault by the obsidian-automations
`campsite_inventory` doit task). This module projects it into `data/campsites.json`
— the STAC-Item-shaped FeatureCollection the map imports and `generate-seed.cjs`
seeds from.

Pure derivation: no network, no iCloud. Every inventory entry becomes a Feature;
`collect: false` (BLM / non-reservable / disabled) sites still render on the map and
carry `properties.collected = false`. The collector itself skips them.

Run via the `geojson` doit task (`uv run doit geojson`) or `python build_geojson.py`.
"""

from __future__ import annotations

import json
from pathlib import Path

DATA_DIR = Path(__file__).resolve().parent
INVENTORY = DATA_DIR.parent / "backend" / "src" / "campsites-index.json"
GEOJSON_OUT = DATA_DIR / "campsites.json"

AGENCY_FULL = {
    "blm": "Bureau of Land Management",
    "nps": "National Park Service",
    "usfs": "US Forest Service",
    "wa-state-parks": "Washington State Parks",
}


def _feature(e: dict) -> dict:
    """One enriched inventory entry → a STAC-Item-shaped GeoJSON Feature."""
    slug = e["slug"]
    agency_full = e.get("agency_full") or AGENCY_FULL.get(e["agency"])
    collected = e.get("collect") is not False

    links: list[dict] = []
    if e.get("reservation_url"):
        links.append({"rel": "reservation", "href": e["reservation_url"],
                      "type": "text/html", "title": "Reserve"})
    if e.get("official_url"):
        links.append({"rel": "official", "href": e["official_url"],
                      "type": "text/html", "title": "Official page"})

    properties = {
        "id":                   slug,
        "guid":                 e["guid"],
        "name":                 e["name"],
        "agency":               agency_full,
        "agency_short":         e["agency"],
        "provider":             agency_full,
        "sites":                e.get("sites"),
        "types":                e.get("types") or [],
        "reservable":           bool(e.get("reservable")),
        "year_round":           e.get("year_round"),
        "open_month":           e.get("open_month"),
        "availability_windows": e.get("availability_windows") or [],
        "rec_gov_id":           e["id"] if e["kind"] == "rec" else None,
        "wa_park_id":           int(e["ref"]) if e["kind"] == "wa" and e.get("ref") is not None else None,
        "notes":                e.get("notes"),
        "reservation_url":      e.get("reservation_url"),
        "official_url":         e.get("official_url"),
        "collected":            collected,
    }
    return {
        "type": "Feature",
        "id": slug,
        "geometry": {"type": "Point", "coordinates": [e["lng"], e["lat"]]},
        "properties": properties,
        "links": links,
        "assets": {},
    }


def build() -> int:
    """Read the inventory, write campsites.json, return the feature count."""
    inventory = json.loads(INVENTORY.read_text(encoding="utf-8"))
    features = [_feature(e) for e in inventory]
    features.sort(key=lambda f: (f["properties"]["agency_short"], f["properties"]["name"]))
    GEOJSON_OUT.write_text(
        json.dumps({"type": "FeatureCollection", "features": features}, indent=2) + "\n"
    )
    return len(features)


def main():
    n = build()
    print(f"geojson: {n} features → {GEOJSON_OUT}")


if __name__ == "__main__":
    main()
