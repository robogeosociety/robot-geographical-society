#!/usr/bin/env python3
"""
CLI entry point — Update campsites.json with live availability data.

Usage:
    uv run update-availability
    uv run python scripts/update_availability.py
"""

import argparse
import sys
from pathlib import Path
from campsite_sync.update import update_availability

def main() -> None:
    parser = argparse.ArgumentParser(
        description="Update campsites.json with live availability data."
    )
    parser.add_argument(
        "--input",
        metavar="FILE",
        default="campsites.json",
        help="Path to campsites.json (default: campsites.json in current directory)",
    )
    parser.add_argument(
        "--verbose",
        action="store_true",
        help="Print detailed progress",
    )
    args = parser.parse_args()

    try:
        update_availability(args.input, verbose=args.verbose)
    except Exception as exc:
        print(f"\nError: {exc}", file=sys.stderr)
        sys.exit(1)

if __name__ == "__main__":
    main()
