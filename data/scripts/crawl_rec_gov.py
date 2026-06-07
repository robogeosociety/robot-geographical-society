#!/usr/bin/env python3
"""
Discover Recreation.gov WA campgrounds not yet in the campsite inventory.

Fetches campground listings from the recreation.gov search API, cross-references
against the rec.gov ids already in `backend/src/campsites-index.json` (the
authoritative inventory), and prints the new candidates as ready-to-paste
inventory stubs.

Read-only: it never edits files. To track a candidate, paste its stub into
`backend/src/campsites-index.json`, then enrich + derive:
    1. (obsidian-automations) uv run doit campsite_inventory   # vault → enriched inventory
    2. (data/)               uv run doit geojson                # inventory → campsites.json

Usage (from data/):
    uv run crawl                   # search all WA campgrounds (up to 500)
    uv run crawl --max 200         # limit search results
    uv run crawl --url https://www.recreation.gov/camping/campgrounds/233864
"""

import argparse
import json
import re
import sys
from pathlib import Path
from urllib.parse import urlencode

from playwright.sync_api import APIRequestContext, sync_playwright

_BASE = "https://www.recreation.gov"
_SEARCH_PATH = "/api/search"
_CAMPGROUND_PATH = "/api/camps/campgrounds/{id}"
_CAMPSITES_PATH = "/api/camps/campgrounds/{id}/campsites"

# The authoritative inventory, relative to data/.
INVENTORY = Path("../backend/src/campsites-index.json")

WA_LAT = (45.0, 49.5)
WA_LNG = (-125.0, -116.0)


# ---------------------------------------------------------------------------
# Playwright helpers
# ---------------------------------------------------------------------------

def _new_context(playwright) -> APIRequestContext:
    return playwright.request.new_context(
        base_url=_BASE,
        extra_http_headers={"Accept": "application/json, text/plain, */*"},
    )


def _search_wa_campgrounds(ctx: APIRequestContext, max_results: int) -> list[dict]:
    """
    Page through recreation.gov search results for WA campgrounds.
    Returns a flat list of result dicts (may be truncated to max_results).
    """
    results: list[dict] = []
    page_size = min(100, max_results)
    start = 0

    while len(results) < max_results:
        # Build URL manually so multiple `fq` params are encoded correctly
        qs = urlencode(
            [
                ("q", ""),
                ("fq", "state_code:WA"),
                ("fq", "entity_type:campground"),
                ("size", page_size),
                ("start", start),
            ]
        )
        resp = ctx.get(f"{_SEARCH_PATH}?{qs}")
        if not resp.ok:
            print(f"  Warning: search returned HTTP {resp.status}", file=sys.stderr)
            break
        data = resp.json()
        batch = data.get("results", [])
        if not batch:
            break
        results.extend(batch)
        start += len(batch)
        total = data.get("total", 0)
        if start >= total:
            break

    return results[:max_results]


def _search_by_id(ctx: APIRequestContext, cid: str) -> dict | None:
    """
    Look up a single campground by ID via the search API.
    Returns the search result dict (with parent_name, lat, lng) or None.
    """
    qs = urlencode([("q", cid), ("fq", "entity_type:campground"), ("size", 5)])
    resp = ctx.get(f"{_SEARCH_PATH}?{qs}")
    if not resp.ok:
        return None
    for r in resp.json().get("results", []):
        if str(r.get("entity_id")) == cid:
            return r
    return None


def _fetch_campground_detail(ctx: APIRequestContext, cid: str) -> dict:
    """Fetch full campground record from the campground detail API (fallback)."""
    resp = ctx.get(
        _CAMPGROUND_PATH.format(id=cid),
        headers={"Referer": f"{_BASE}/camping/campgrounds/{cid}"},
    )
    if not resp.ok:
        return {}
    return resp.json().get("campground", {})


def _fetch_site_count(ctx: APIRequestContext, cid: str) -> int:
    """Return the total number of bookable campsites for a campground."""
    try:
        resp = ctx.get(
            _CAMPSITES_PATH.format(id=cid),
            headers={"Referer": f"{_BASE}/camping/campgrounds/{cid}"},
        )
        if resp.ok:
            campsites = resp.json().get("campsites", [])
            return len(campsites) if isinstance(campsites, list) else 0
    except Exception:
        pass
    return 0


# ---------------------------------------------------------------------------
# Dataset helpers
# ---------------------------------------------------------------------------

def _load_existing_ids(inventory_path: Path) -> set[str]:
    """Return the set of rec.gov ids already tracked in the inventory."""
    inventory = json.loads(inventory_path.read_text(encoding="utf-8"))
    return {
        str(e["ref"])
        for e in inventory
        if e.get("kind") == "rec" and e.get("ref") is not None
    }


# ---------------------------------------------------------------------------
# Agency inference + candidate normalisation
# ---------------------------------------------------------------------------

def _detect_agency(parent_name: str) -> tuple[str, str]:
    """Return (agency_short, agency_full) from a parent organisation name."""
    lower = parent_name.lower()
    if "national forest" in lower:
        return "usfs", "US Forest Service"
    if "national recreation area" in lower or "national park" in lower:
        return "nps", "National Park Service"
    if "bureau of land management" in lower or " blm" in lower:
        return "blm", "Bureau of Land Management"
    if "state park" in lower:
        return "wa-state-parks", "Washington State Parks"
    # Fallback — user will need to review
    return "usfs", "US Forest Service"


def _from_search_result(r: dict) -> dict:
    """Build a normalised candidate dict from a search API result."""
    return {
        "id": str(r.get("entity_id", "")),
        "name": r.get("name") or "",
        "parent_name": r.get("parent_name") or "",
        "lat": r.get("latitude"),
        "lng": r.get("longitude"),
        "reservable": r.get("reservable", True),
        "site_count": 0,
    }


def _from_detail(cid: str, cg: dict) -> dict:
    """Build a normalised candidate dict from a campground detail record (fallback)."""
    # API uses snake_case; derive a rough parent from org_code + alternate_names
    org_code = cg.get("org_code", "")
    alt_names = cg.get("alternate_names", "") or ""
    # alternate_names pattern: "ABBR,ABBR,FOREST NAME NF - FS" — take last segment
    parts = [p.strip() for p in alt_names.split(",") if len(p.strip()) > 6]
    parent = parts[-1] if parts else org_code
    return {
        "id": cid,
        "name": cg.get("facility_name") or cid,
        "parent_name": parent,
        "lat": cg.get("facility_latitude"),
        "lng": cg.get("facility_longitude"),
        "reservable": True,
        "site_count": 0,
    }


def _inventory_stub(c: dict) -> dict:
    """A ready-to-paste backend/src/campsites-index.json entry for a candidate."""
    agency_short, _ = _detect_agency(c.get("parent_name", ""))
    return {
        "id": c["id"],
        "kind": "rec",
        "ref": c["id"],
        "name": c["name"],
        "agency": agency_short,
    }


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main() -> None:
    parser = argparse.ArgumentParser(
        description="Discover Recreation.gov WA campgrounds not yet in the inventory."
    )
    parser.add_argument(
        "--max", type=int, default=500, metavar="N",
        help="Max search results to fetch (default: 500)",
    )
    parser.add_argument(
        "--url", metavar="URL",
        help="Check a specific Recreation.gov campground URL",
    )
    args = parser.parse_args()

    if not INVENTORY.exists():
        print(f"Error: {INVENTORY} not found — run from data/", file=sys.stderr)
        sys.exit(1)

    print("Loading existing campsite IDs...")
    existing_ids = _load_existing_ids(INVENTORY)
    print(f"  {len(existing_ids)} recreation.gov IDs already in the inventory\n")

    candidates: list[dict] = []

    print("Connecting to recreation.gov...")
    with sync_playwright() as p:
        ctx = _new_context(p)
        try:
            if args.url:
                # --- Single URL mode ---
                m = re.search(r"/campgrounds/(\d+)", args.url)
                if not m:
                    print(f"Could not parse campground ID from: {args.url}", file=sys.stderr)
                    sys.exit(1)
                cid = m.group(1)
                print(f"Checking campground {cid}...")
                if cid in existing_ids:
                    print(f"  Already in the inventory (rec.gov id: {cid})")
                    sys.exit(0)
                # Try search API first (has parent_name, lat, lng already formatted)
                search_result = _search_by_id(ctx, cid)
                if search_result:
                    c = _from_search_result(search_result)
                else:
                    # Fallback to detail API
                    cg = _fetch_campground_detail(ctx, cid)
                    if not cg:
                        print(f"  No data returned for ID {cid}", file=sys.stderr)
                        sys.exit(1)
                    c = _from_detail(cid, cg)
                c["site_count"] = _fetch_site_count(ctx, cid)
                candidates = [c]

            else:
                # --- Full search mode ---
                print(f"Searching for WA campgrounds (max {args.max})...")
                results = _search_wa_campgrounds(ctx, max_results=args.max)
                already = sum(1 for r in results if str(r.get("entity_id", "")) in existing_ids)
                new_results = [r for r in results if str(r.get("entity_id", "")) not in existing_ids]
                print(f"  {len(results)} total  |  {already} already in inventory  |  {len(new_results)} new\n")
                candidates = [_from_search_result(r) for r in new_results]

                if candidates:
                    print(f"Fetching site counts for {len(candidates)} candidate(s)...")
                    for i, c in enumerate(candidates, 1):
                        try:
                            c["site_count"] = _fetch_site_count(ctx, c["id"])
                        except Exception:
                            c["site_count"] = 0
                        if i % 10 == 0:
                            print(f"  {i}/{len(candidates)}...", end="\r", flush=True)
                    print()

        finally:
            ctx.dispose()

    if not candidates:
        print("No new campgrounds found.")
        return

    # Filter to WA bounds and warn on anything outside
    in_bounds = []
    for c in candidates:
        lat, lng = c.get("lat"), c.get("lng")
        if lat is None or lng is None:
            in_bounds.append(c)  # keep — coordinates unknown
            continue
        try:
            lat, lng = float(lat), float(lng)
            c["lat"], c["lng"] = lat, lng
        except (TypeError, ValueError):
            in_bounds.append(c)
            continue
        if WA_LAT[0] <= lat <= WA_LAT[1] and WA_LNG[0] <= lng <= WA_LNG[1]:
            in_bounds.append(c)
        # silently skip out-of-state campgrounds (e.g. Oregon border facilities)
    candidates = in_bounds

    if not candidates:
        print("No new WA campgrounds found after bounds filtering.")
        return

    # --- Display table ---
    print(f"\n{'#':>4}  {'ID':>8}  {'Sites':>5}  {'Name':<38}  Parent")
    print("-" * 95)
    for i, c in enumerate(candidates, 1):
        name = (c["name"] or "")[:37]
        parent = (c["parent_name"] or "(unknown)")[:30]
        print(f"{i:>4}  {c['id']:>8}  {c.get('site_count', 0):>5}  {name:<38}  {parent}")

    print(f"\n{len(candidates)} new campground(s) found.\n")

    # --- Inventory stubs (read-only; paste the ones you want to track) ---
    print("Inventory stubs — paste the ones to track into backend/src/campsites-index.json:")
    for c in candidates:
        print("  " + json.dumps(_inventory_stub(c)))
    print("\nThen enrich (obsidian-automations: uv run doit campsite_inventory) "
          "and derive (data/: uv run doit geojson).")


if __name__ == "__main__":
    main()
