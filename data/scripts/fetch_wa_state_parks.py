#!/usr/bin/env python3
"""
CLI entry point — fetch washington.goingtocamp.com availability for a WA State Park.

Usage (from data/):
    uv run fetch-wa-state-parks "Deception Pass"
    uv run fetch-wa-state-parks -2147483624          # by resourceLocationId
    uv run python scripts/fetch_wa_state_parks.py "Deception Pass"
"""

import sys
from campsite_sync.wa_state_parks import (
    fetch_availability,
    find_park,
    get_session_cookies,
    list_parks,
)


def main() -> None:
    args = sys.argv[1:]
    if not args:
        print("Usage: fetch-wa-state-parks <park_name_or_id>", file=sys.stderr)
        sys.exit(1)

    query = " ".join(args)

    print("  Establishing browser session...", file=sys.stderr)
    cookies = get_session_cookies()

    # Resolve park: by numeric ID or name search
    resource_location_id: int | None = None
    park_name = query
    try:
        resource_location_id = int(query)
    except ValueError:
        park = find_park(query, cookies=cookies)
        if park is None:
            print(f"No park found matching {query!r}", file=sys.stderr)
            print("\nAvailable parks:", file=sys.stderr)
            for p in sorted(list_parks(cookies), key=lambda x: x["name"]):
                print(f"  {p['resource_location_id']:>14}  {p['name']}", file=sys.stderr)
            sys.exit(1)
        resource_location_id = park["resource_location_id"]
        park_name = park["full_name"]

    print(f"\n{park_name} (id={resource_location_id})", file=sys.stderr)

    result = fetch_availability(resource_location_id, cookies=cookies, verbose=True)

    print(f"\n{park_name} — availability summary (monthly)")
    print(f"  First available month : {result['first_available']}")
    print(f"  Season open (est.)    : {result['season_open']}")
    print(f"  Season close (est.)   : {result['season_close']}")
    print(f"\nMonthly breakdown:")
    print(f"  {'Month':<12}  {'Avail':>5}  {'Rsvd':>5}  {'N/A':>5}  {'Other':>5}")
    for month, c in sorted(result["by_date"].items()):
        avail = c["available"]
        rsvd = c["reserved"]
        na = c["not_available"]
        other = c["other"]
        if avail > 0 or rsvd > 0:
            print(f"  {month}  {avail:>5}  {rsvd:>5}  {na:>5}  {other:>5}")


if __name__ == "__main__":
    main()
