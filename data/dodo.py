"""doit tasks for the campsite data project.

    uv run doit geojson     # backend/src/campsites-index.json → data/campsites.json

The authoritative inventory (`backend/src/campsites-index.json`) is maintained by the
obsidian-automations `campsite_inventory` task (camping vault → enriched inventory).
This project only derives the map GeoJSON from it. See data/README.md.
"""

from pathlib import Path

import build_geojson

HERE = Path(__file__).resolve().parent
INVENTORY = HERE.parent / "backend" / "src" / "campsites-index.json"
GEOJSON = HERE / "campsites.json"

DOIT_CONFIG = {"verbosity": 2}


def task_geojson():
    """Derive data/campsites.json from the authoritative campsite inventory."""
    return {
        "file_dep": [str(INVENTORY), str(HERE / "build_geojson.py")],
        "targets": [str(GEOJSON)],
        "actions": [build_geojson.main],
        "clean": True,
        "doc": "campsites-index.json → campsites.json (GeoJSON FeatureCollection).",
    }
