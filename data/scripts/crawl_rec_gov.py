#!/usr/bin/env python3
"""
Crawl Recreation.gov for WA campgrounds not yet in this dataset,
then prompt to add them in batch.

Fetches campground listings from the recreation.gov search API, cross-references
against all rec_gov_id values already in campsites.toml, and presents new
candidates in an interactive numbered list. Selected entries get an index.md
created and are appended to campsites.toml (kept alphabetical).

Usage (from data/):
    uv run crawl                   # search all WA campgrounds (up to 500)
    uv run crawl --max 200         # limit search results
    uv run crawl --url https://www.recreation.gov/camping/campgrounds/233864
"""

import argparse
import re
import sys
import tomllib
from pathlib import Path
from urllib.parse import urlencode

import yaml
from playwright.sync_api import APIRequestContext, sync_playwright

_BASE = "https://www.recreation.gov"
_SEARCH_PATH = "/api/search"
_CAMPGROUND_PATH = "/api/camps/campgrounds/{id}"
_CAMPSITES_PATH = "/api/camps/campgrounds/{id}/campsites"

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

def _load_existing_ids(toml_path: Path) -> set[str]:
    """Return the set of rec_gov_id strings already tracked in campsites.toml."""
    with open(toml_path, "rb") as f:
        config = tomllib.load(f)

    ids: set[str] = set()
    for entry in config.get("campsites", []):
        path = Path(entry.get("path", ""))
        if not path.exists():
            continue
        text = path.read_text()
        m = re.match(r"^---\n(.*?)\n---", text, re.DOTALL)
        if not m:
            continue
        try:
            fm = yaml.safe_load(m.group(1)) or {}
        except yaml.YAMLError:
            continue
        rid = fm.get("rec_gov_id")
        if rid:
            ids.add(str(rid))
    return ids


def _load_toml_entries(toml_path: Path) -> list[dict]:
    """Load campsites.toml and return the list of {name, path} dicts."""
    with open(toml_path, "rb") as f:
        config = tomllib.load(f)
    return list(config.get("campsites", []))


def _write_toml(toml_path: Path, entries: list[dict]) -> None:
    """Write campsites.toml from a list of {name, path} dicts, sorted by name."""
    lines: list[str] = []
    for e in sorted(entries, key=lambda x: x["name"]):
        lines.append("[[campsites]]")
        lines.append(f'name = "{e["name"]}"')
        lines.append(f'path = "{e["path"]}"')
        lines.append("")
    toml_path.write_text("\n".join(lines))


# ---------------------------------------------------------------------------
# Agency / path inference
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


def _detect_subdir(agency_short: str, parent_name: str) -> str | None:
    """Return the forest/park subdirectory name, or None if unrecognised."""
    lower = parent_name.lower()
    if agency_short == "usfs":
        if "okanogan" in lower or "wenatchee" in lower:
            return "Okanogan_Wenatchee_NF"
        if "baker" in lower or "snoqualmie" in lower:
            return "Mt_Baker_Snoqualmie_NF"
        if "olympic" in lower:
            return "Olympic_NF"
        if "gifford" in lower or "pinchot" in lower:
            return "Gifford_Pinchot_NF"
        if "colville" in lower:
            return "Colville_NF"
        if "umatilla" in lower:
            return "Umatilla_NF"
        return None
    if agency_short == "nps":
        if "rainier" in lower:
            return "Mt_Rainier_NP"
        if "olympic" in lower:
            return "Olympic_NP"
        if "north cascades" in lower:
            return "North_Cascades_NP"
        if "lake roosevelt" in lower or "roosevelt" in lower:
            return "Lake_Roosevelt_NRA"
        return None
    return None


def _slugify(name: str) -> str:
    """Convert a campsite name to a filesystem-safe slug."""
    slug = re.sub(r"[^\w\s'\-]", "", name)
    slug = re.sub(r"[\s\-]+", "_", slug.strip())
    return slug


# ---------------------------------------------------------------------------
# index.md generation
# ---------------------------------------------------------------------------

def _build_index_md(candidate: dict, site_count: int, agency_short: str, agency_full: str) -> str:
    """Return the full text of a new index.md for a candidate campsite."""
    rec_id = candidate["id"]
    lat = round(float(candidate.get("lat") or 0.0), 4)
    lng = round(float(candidate.get("lng") or 0.0), 4)
    url = f"https://www.recreation.gov/camping/campgrounds/{rec_id}"

    fm = {
        "name": candidate["name"],
        "agency": agency_full,
        "agency_short": agency_short,
        "state": "WA",
        "lat": lat,
        "lng": lng,
        "sites": site_count,
        "types": ["tent", "rv"],  # default — review after adding
        "reservable": True,
        "rec_gov_id": rec_id,
        "reservation_url": url,
        "official_url": url,
        "availability_windows": [
            {
                "start": "05-01",
                "end": "09-30",
                "booking_advance_days": 180,
                "site_total_count": site_count,
                "reserved_count": 0,
            }
        ],
    }

    parent = candidate.get("parent_name") or "Washington State"
    body = f"Recreation.gov campground in {parent}."
    fm_text = yaml.dump(fm, sort_keys=False, allow_unicode=True, width=1000).strip()
    return f"---\n{fm_text}\n---\n\n{body}\n"


# ---------------------------------------------------------------------------
# Candidate normalisation
# ---------------------------------------------------------------------------

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


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main() -> None:
    parser = argparse.ArgumentParser(
        description="Find Recreation.gov WA campgrounds not yet in the dataset."
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

    toml_path = Path("campsites.toml")
    if not toml_path.exists():
        print("Error: campsites.toml not found — run from data/", file=sys.stderr)
        sys.exit(1)

    print("Loading existing campsite IDs...")
    existing_ids = _load_existing_ids(toml_path)
    print(f"  {len(existing_ids)} recreation.gov IDs already in dataset\n")

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
                    print(f"  Already in dataset (rec_gov_id: {cid})")
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
                print(f"  {len(results)} total  |  {already} already in dataset  |  {len(new_results)} new\n")
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

    # --- Selection prompt ---
    while True:
        raw = input("Add which? (e.g. '1,3,5' | 'a'=all | 'q'=quit): ").strip()
        if raw.lower() == "q":
            print("Cancelled — nothing added.")
            return
        if raw.lower() == "a":
            selected = list(candidates)
            break
        try:
            indices = [int(x.strip()) - 1 for x in raw.split(",") if x.strip()]
            if any(i < 0 or i >= len(candidates) for i in indices):
                print(f"  Out of range — enter 1–{len(candidates)}")
                continue
            selected = [candidates[i] for i in indices]
            break
        except ValueError:
            print("  Enter numbers (e.g. '1,3'), 'a' for all, or 'q' to quit.")

    if not selected:
        print("Nothing selected.")
        return

    # --- Write files and update TOML ---
    toml_entries = _load_toml_entries(toml_path)
    existing_paths = {e["path"] for e in toml_entries}
    added: list[str] = []

    with sync_playwright() as p:
        ctx = _new_context(p)
        try:
            for c in selected:
                agency_short, agency_full = _detect_agency(c.get("parent_name", ""))
                subdir = _detect_subdir(agency_short, c.get("parent_name", ""))
                slug = _slugify(c["name"])

                if subdir:
                    rel_path = f"campsites/{agency_short}/WA/{subdir}/{slug}.md"
                else:
                    rel_path = f"campsites/{agency_short}/WA/{slug}.md"

                if rel_path in existing_paths:
                    print(f"  Skipping {c['name']} — path already in TOML: {rel_path}")
                    continue

                # Fetch site count if not already available
                if not c.get("site_count"):
                    try:
                        c["site_count"] = _fetch_site_count(ctx, c["id"])
                    except Exception:
                        c["site_count"] = 0

                file_path = Path(rel_path)
                file_path.parent.mkdir(parents=True, exist_ok=True)
                file_path.write_text(_build_index_md(c, c.get("site_count", 0), agency_short, agency_full))

                toml_entries.append({"name": c["name"], "path": rel_path})
                existing_paths.add(rel_path)
                added.append(f"  + {c['name']:40s}  {rel_path}")
        finally:
            ctx.dispose()

    if added:
        _write_toml(toml_path, toml_entries)
        print("\nAdded:")
        for line in added:
            print(line)
        print(f"\n{len(added)} campsite(s) added.")
        print("Next steps:")
        print("  1. Review and edit the new index.md file(s) — check types, availability_windows, lat/lng")
        print("  2. Run 'uv run generate' to rebuild campsites.json")
    else:
        print("Nothing was added.")


if __name__ == "__main__":
    main()
