"""
Washington State Parks availability client (washington.goingtocamp.com).

The GoingToCamp API requires browser session cookies (WAF-protected), so this
module uses Playwright to establish a session and then makes direct API calls.

API notes:
  - Parks are identified by `resourceLocationId` (from /api/resourceLocation)
  - Each park has multiple maps (sections); /api/maps returns all for a park
  - Availability is queried per-map per-date-range via /api/availability/map
  - Response granularity is per-resource (campsite) per-query-period, not per-day
  - This module queries month-by-month and uses the 1st of each month as the key
    in `by_date` (monthly granularity, unlike rec_gov.py which is truly daily)

Importable:
    from campsite_sync.wa_state_parks import fetch_availability, list_parks, get_session_cookies

    cookies = get_session_cookies()
    parks = list_parks(cookies)
    result = fetch_availability(-2147483624, cookies=cookies)
    print(result["first_available"])
"""

import json
import sys
import urllib.request
from datetime import date
from typing import Optional

BASE = "https://washington.goingtocamp.com"
BOOKING_CATEGORY_CAMPING = 0

# Integer availability codes → semantic label
_AVAIL_CODE: dict[int, str] = {
    0: "available",        # open for reservation
    1: "reserved",         # fully booked
    2: "unavailable",      # closed/blocked
    3: "not_reservable",   # walk-in / no-fee sites
    4: "not_operating",    # off-season closure
    5: "available",        # partially available (treat as available)
}


# ---------------------------------------------------------------------------
# Session management
# ---------------------------------------------------------------------------

def get_session_cookies() -> str:
    """
    Launch a headless browser to obtain valid GoingToCamp session cookies.

    This is required because the site uses a WAF that blocks plain HTTP clients.
    The returned cookie string can be reused across multiple API calls within the
    same session (typically valid for ~30 minutes).
    """
    from playwright.sync_api import sync_playwright

    with sync_playwright() as p:
        browser = p.chromium.launch()
        ctx = browser.new_context()
        page = ctx.new_page()
        page.goto(BASE, wait_until="networkidle", timeout=30000)
        page.wait_for_timeout(1000)
        try:
            page.get_by_text("I Consent").click(timeout=2000)
            page.wait_for_timeout(500)
        except Exception:
            pass
        cookies = ctx.cookies()
        browser.close()

    return "; ".join(f"{c['name']}={c['value']}" for c in cookies)


def _headers(cookies: str) -> dict:
    return {
        "User-Agent": (
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
            "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
        ),
        "Accept": "application/json",
        "Referer": f"{BASE}/",
        "Cookie": cookies,
    }


def _get(path: str, cookies: str) -> object:
    req = urllib.request.Request(BASE + path, headers=_headers(cookies))
    with urllib.request.urlopen(req, timeout=15) as r:
        return json.loads(r.read())


# ---------------------------------------------------------------------------
# Park directory
# ---------------------------------------------------------------------------

def list_parks(cookies: str | None = None) -> list[dict]:
    """
    Return all WA State Parks from GoingToCamp with their resourceLocationId.

    Each item: {resource_location_id, name, full_name, gps}
    """
    if cookies is None:
        cookies = get_session_cookies()
    data = _get("/api/resourceLocation", cookies)
    return [
        {
            "resource_location_id": p["resourceLocationId"],
            "name": (p.get("localizedValues") or [{}])[0].get("shortName", ""),
            "full_name": (p.get("localizedValues") or [{}])[0].get("fullName", ""),
            "gps": p.get("gpsCoordinates"),
        }
        for p in (data if isinstance(data, list) else [])
    ]


def find_park(name: str, cookies: str | None = None) -> dict | None:
    """
    Find a park by name (case-insensitive substring match).
    Returns the first matching park dict, or None.
    """
    if cookies is None:
        cookies = get_session_cookies()
    name_lower = name.lower()
    for park in list_parks(cookies):
        if name_lower in park["name"].lower() or name_lower in park["full_name"].lower():
            return park
    return None


# ---------------------------------------------------------------------------
# Availability
# ---------------------------------------------------------------------------

def _get_map_ids(
    resource_location_id: int,
    cookies: str,
    booking_category: int = BOOKING_CATEGORY_CAMPING,
) -> list[int]:
    """Return all mapIds for a park (some may be forbidden; filtered on use)."""
    maps = _get(
        f"/api/maps?resourceLocationId={resource_location_id}"
        f"&bookingCategoryId={booking_category}",
        cookies,
    )
    return [m["mapId"] for m in (maps if isinstance(maps, list) else []) if m.get("mapId")]


def _query_map_month(
    map_id: int,
    year: int,
    month: int,
    cookies: str,
    booking_category: int = BOOKING_CATEGORY_CAMPING,
) -> dict[str, int]:
    """
    Query one map for one month. Returns {resource_id: availability_code}.
    Raises on HTTP errors (caller handles 403 gracefully).
    """
    if month == 12:
        end_month, end_year = 1, year + 1
    else:
        end_month, end_year = month + 1, year

    start = date(year, month, 1).isoformat()
    end = date(end_year, end_month, 1).isoformat()

    data = _get(
        f"/api/availability/map"
        f"?mapId={map_id}"
        f"&startDate={start}"
        f"&endDate={end}"
        f"&bookingCategoryId={booking_category}"
        f"&nights=1",
        cookies,
    )
    return {
        rid: avails[0]["availability"]
        for rid, avails in data.get("resourceAvailabilities", {}).items()
        if avails
    }


def fetch_availability(
    resource_location_id: int,
    months: int = 6,
    start: Optional[date] = None,
    cookies: Optional[str] = None,
    *,
    verbose: bool = False,
) -> dict:
    """
    Fetch availability for a WA State Park by resourceLocationId.

    Queries month-by-month across all maps and aggregates resource availability
    codes. `by_date` keys are the 1st of each month (monthly granularity).

    Returns:
        {
            "resource_location_id": int,
            "first_available": str | None,   # ISO date (YYYY-MM-01)
            "season_open":     str | None,   # first month with available/reserved sites
            "season_close":    str | None,   # last month with available/reserved sites
            "by_date":         dict,         # {YYYY-MM-01: {available, reserved, not_available, other}}
        }

    Note: Launches Playwright to establish a session if `cookies` is not provided.
    Pass pre-fetched cookies to avoid the startup overhead on repeat calls.
    """
    if start is None:
        start = date.today()
    if cookies is None:
        if verbose:
            print("  Establishing browser session...", file=sys.stderr)
        cookies = get_session_cookies()

    map_ids = _get_map_ids(resource_location_id, cookies)
    if verbose:
        print(f"  Park {resource_location_id}: {len(map_ids)} maps found", file=sys.stderr)

    all_counts: dict[str, dict] = {}

    for delta in range(months):
        raw_month = start.month + delta
        y = start.year + (raw_month - 1) // 12
        m = ((raw_month - 1) % 12) + 1
        month_key = f"{y}-{m:02d}-01"

        if verbose:
            print(f"  Fetching {y}-{m:02d}...", file=sys.stderr)

        counts = {"available": 0, "reserved": 0, "not_available": 0, "other": 0}
        seen_resources: set[str] = set()

        for map_id in map_ids:
            try:
                resources = _query_map_month(map_id, y, m, cookies)
                for rid, code in resources.items():
                    if rid in seen_resources:
                        continue
                    seen_resources.add(rid)
                    label = _AVAIL_CODE.get(code, "other")
                    if label == "available":
                        counts["available"] += 1
                    elif label == "reserved":
                        counts["reserved"] += 1
                    elif label in ("unavailable", "not_reservable", "not_operating"):
                        counts["not_available"] += 1
                    else:
                        counts["other"] += 1
            except Exception as exc:
                if verbose:
                    code_str = str(exc)
                    if "403" not in code_str:  # 403 is expected for some sub-maps
                        print(f"    Warning map {map_id}: {exc}", file=sys.stderr)

        all_counts[month_key] = counts

    sorted_dates = sorted(all_counts)

    first_available = next(
        (d for d in sorted_dates if all_counts[d]["available"] > 0), None
    )
    open_dates = [
        d for d in sorted_dates
        if all_counts[d]["available"] > 0 or all_counts[d]["reserved"] > 0
    ]

    return {
        "resource_location_id": resource_location_id,
        "first_available": first_available,
        "season_open": open_dates[0] if open_dates else None,
        "season_close": open_dates[-1] if open_dates else None,
        "by_date": all_counts,
    }
