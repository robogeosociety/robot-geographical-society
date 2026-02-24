#!/usr/bin/env python3
"""
CLI entry point — validate index.md files and rebuild campsites.json.

Usage (from data/):
    uv run generate
    uv run generate --output /path/to/output.json
    uv run generate --base /path/to/data --output /path/to/output.json
    uv run python scripts/sync_to_geojson.py [--base DIR] [--output FILE]
"""

import argparse
import sys
from campsite_sync.sync import sync


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Validate campsite index.md files and rebuild campsites.json."
    )
    parser.add_argument(
        "--base",
        metavar="DIR",
        default=None,
        help="Data directory containing agency sub-folders (default: auto-detect from cwd)",
    )
    parser.add_argument(
        "--output",
        metavar="FILE",
        default=None,
        help="Output GeoJSON path (default: campsites.json inside --base)",
    )
    args = parser.parse_args()

    try:
        sync(base=args.base, output=args.output)
    except RuntimeError as exc:
        print(f"\n{exc}", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
