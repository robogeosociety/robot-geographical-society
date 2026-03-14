#!/usr/bin/env python3
"""
Export SQLite availability data to web/public/availability.json.

The JSON structure is:
    {campsite_id: {date: available_count, ...}, ...}

where campsite_id is the rec_gov_id or wa_park_id (as a string).

Usage (from data/):
    uv run export
    uv run export --db availability.db --out ../web/public/availability.json
"""

import argparse
import json
import sys
from pathlib import Path

from campsite_sync.db import export_all


def main():
    parser = argparse.ArgumentParser(
        description="Export SQLite availability data to availability.json for the frontend."
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
        help="Output JSON path (default: ../web/public/availability.json)",
    )
    args = parser.parse_args()

    db_path = Path(args.db)
    if not db_path.exists():
        print(f"Error: database not found at {db_path}", file=sys.stderr)
        print("Run 'uv run update' first to populate it.", file=sys.stderr)
        sys.exit(1)

    print(f"Reading {db_path}...")
    data = export_all(db_path)

    if not data:
        print("No availability data found in database.", file=sys.stderr)
        sys.exit(1)

    out_path = Path(args.out)
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(json.dumps(data, separators=(",", ":")) + "\n")

    total_dates = sum(len(v) for v in data.values())
    print(f"Exported {len(data)} campsites, {total_dates} date entries → {out_path}")


if __name__ == "__main__":
    main()
