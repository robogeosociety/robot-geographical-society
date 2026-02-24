"""
Recreation.gov availability API client (Playwright-based).

Uses Playwright's APIRequestContext instead of urllib so that cookie handling,
redirects, and header negotiation are managed by a real browser engine — consistent
with the WA State Parks client.

Importable from the notebook or CLI:

    from campsite_sync.rec_gov import fetch_availability

    result = fetch_availability("232038")
    print(result["first_available"])   # "2026-05-15"
    print(result["season_open"])       # "2026-05-15"
    print(result["season_close"])      # "2026-07-31"
    print(result["by_date"])           # {date_str: {available, reserved, not_available, other}}
"""

import sys
from collections import defaultdict
from datetime import date
from typing import Optional

from playwright.sync_api import APIRequestContext, sync_playwright

_BASE = "https://www.recreation.gov"
_AVAILABILITY_PATH = "/api/camps/availability/campground/{id}/month"


def _new_context(playwright) -> APIRequestContext:
    """Create a Playwright APIRequestContext configured for recreation.gov."""
    return playwright.request.new_context(
        base_url=_BASE,
        extra_http_headers={
            "Accept": "application/json, text/plain, */*",
        },
    )


def fetch_month(
    campground_id: str,
    year: int,
    month: int,
    *,
    context: Optional[APIRequestContext] = None,
) -> dict:
    """
    Fetch raw availability JSON for one month from recreation.gov.

    Pass a pre-created `context` to avoid Playwright startup overhead when
    fetching multiple months. If omitted, a one-shot context is created.
    """
    start = date(year, month, 1).strftime("%Y-%m-%dT00:00:00.000Z")
    path = _AVAILABILITY_PATH.format(id=campground_id)

    def _do(ctx: APIRequestContext) -> dict:
        resp = ctx.get(
            path,
            params={"start_date": start},
            headers={"Referer": f"{_BASE}/camping/campgrounds/{campground_id}"},
        )
        return resp.json()

    if context is not None:
        return _do(context)

    with sync_playwright() as p:
        ctx = _new_context(p)
        result = _do(ctx)
        ctx.dispose()
        return result


def summarize_month(data: dict) -> dict[str, dict]:
    """
    Collapse a raw month payload into per-date availability counts.

    Returns {date_str: {available, reserved, not_available, other}}.
    """
    counts: dict[str, dict] = defaultdict(
        lambda: {"available": 0, "reserved": 0, "not_available": 0, "other": 0}
    )
    for site in data.get("campsites", {}).values():
        for date_str, status in site.get("availabilities", {}).items():
            day = date_str[:10]
            s = status.lower()
            if s == "available":
                counts[day]["available"] += 1
            elif s == "reserved":
                counts[day]["reserved"] += 1
            elif s == "not available":
                counts[day]["not_available"] += 1
            else:
                counts[day]["other"] += 1
    return dict(counts)


def fetch_availability(
    campground_id: str,
    months: int = 6,
    start: Optional[date] = None,
    *,
    verbose: bool = False,
) -> dict:
    """
    Fetch and summarise availability for `months` months starting from `start`
    (defaults to today).

    Returns:
        {
            "campground_id": str,
            "first_available": str | None,   # ISO date, first date with available > 0
            "season_open":     str | None,   # earliest date with any bookable activity
            "season_close":    str | None,   # latest date with any bookable activity
            "by_date":         dict,         # {date_str: {available, reserved, ...}}
        }
    """
    if start is None:
        start = date.today()

    all_counts: dict[str, dict] = {}

    with sync_playwright() as p:
        ctx = _new_context(p)
        try:
            for delta in range(months):
                raw_month = start.month + delta
                y = start.year + (raw_month - 1) // 12
                m = ((raw_month - 1) % 12) + 1
                if verbose:
                    print(f"  Fetching {y}-{m:02d}...", file=sys.stderr)
                try:
                    data = fetch_month(campground_id, y, m, context=ctx)
                    all_counts.update(summarize_month(data))
                except Exception as exc:
                    if verbose:
                        print(f"  Warning: failed for {y}-{m:02d}: {exc}", file=sys.stderr)
        finally:
            ctx.dispose()

    sorted_dates = sorted(all_counts)

    first_available = next(
        (d for d in sorted_dates if all_counts[d]["available"] > 0), None
    )
    open_dates = [
        d for d in sorted_dates
        if all_counts[d]["available"] > 0 or all_counts[d]["reserved"] > 0
    ]

    return {
        "campground_id": campground_id,
        "first_available": first_available,
        "season_open": open_dates[0] if open_dates else None,
        "season_close": open_dates[-1] if open_dates else None,
        "by_date": all_counts,
    }
