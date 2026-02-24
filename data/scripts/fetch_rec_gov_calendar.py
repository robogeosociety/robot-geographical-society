#!/usr/bin/env python3
"""
CLI entry point — fetch recreation.gov availability for a campground.

Usage (from data/):
    uv run fetch-rec-gov-calendar 232038
    uv run python scripts/fetch_rec_gov_calendar.py 232038
"""

import sys
from campsite_sync.rec_gov import fetch_availability


def main(campground_id: str | None = None) -> None:
    if campground_id is None:
        if len(sys.argv) < 2:
            print("Usage: fetch-rec-gov-calendar <campground_id>", file=sys.stderr)
            sys.exit(1)
        campground_id = sys.argv[1]
    result = fetch_availability(campground_id, verbose=True)

    print(f"\nCampground {campground_id} — availability summary")
    print(f"  First reservable date : {result['first_available']}")
    print(f"  Season open (est.)    : {result['season_open']}")
    print(f"  Season close (est.)   : {result['season_close']}")

    by_date = result["by_date"]
    print(f"\nPer-date breakdown (bookable dates only):")
    print(f"  {'Date':<12}  {'Avail':>5}  {'Rsvd':>5}  {'N/A':>5}")
    for d in sorted(by_date):
        c = by_date[d]
        if c["available"] > 0 or c["reserved"] > 0:
            print(f"  {d}  {c['available']:>5}  {c['reserved']:>5}  {c['not_available']:>5}")


if __name__ == "__main__":
    main()
