#!/usr/bin/env python3
"""
Export SQLite data to web assets.

Outputs two files:
  --out       availability.json  {campsite_id: {date: available_count}}
  --geojson   campsites.json     GeoJSON FeatureCollection joining
                                 campsites + availability tables

Usage (from data/):
    uv run export
    uv run export --db availability.db --out ../web/public/availability.json
    uv run export --geojson ../web/public/campsites-live.json
"""

import argparse
import json
import sys
from pathlib import Path

from campsite_sync.db import export_all, export_geojson


def main():
    parser = argparse.ArgumentParser(
        description="Export SQLite campsite + availability data to JSON for the frontend."
    )
    parser.add_argument(
        "--db",
        default="availability.db",
        metavar="FILE",
        help="Path to the SQLite database (default: availability.db)",
    )
    parser.add_argument(
        "--out",
        default="../web/public/availability.json",
        metavar="FILE",
        help="Output availability JSON path (default: ../web/public/availability.json)",
    )
    parser.add_argument(
        "--geojson",
        metavar="FILE",
        help="Also export a full GeoJSON FeatureCollection with availability embedded",
    )
    args = parser.parse_args()

    db_path = Path(args.db)
    if not db_path.exists():
        print(f"Error: database not found at {db_path}", file=sys.stderr)
        print("Run 'uv run generate' then 'uv run update' to populate it.", file=sys.stderr)
        sys.exit(1)

    # --- availability.json ---
    print(f"Reading {db_path}...")
    data = export_all(db_path)

    if data:
        out_path = Path(args.out)
        out_path.parent.mkdir(parents=True, exist_ok=True)
        out_path.write_text(json.dumps(data, separators=(",", ":")) + "\n")
        total_dates = sum(len(v) for v in data.values())
        print(f"Exported {len(data)} campsites, {total_dates} date entries → {out_path}")
    else:
        print("No availability data in database (run 'uv run update' to fetch it).")

    # --- optional GeoJSON export ---
    if args.geojson:
        geojson = export_geojson(db_path)
        n = len(geojson["features"])
        if n == 0:
            print("No campsite rows found (run 'uv run generate' first).", file=sys.stderr)
        else:
            geo_path = Path(args.geojson)
            geo_path.parent.mkdir(parents=True, exist_ok=True)
            geo_path.write_text(json.dumps(geojson, indent=2) + "\n")
            print(f"Exported {n} features (with availability) → {geo_path}")


if __name__ == "__main__":
    main()
