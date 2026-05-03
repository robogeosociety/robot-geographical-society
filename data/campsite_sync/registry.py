"""
Campsite registry: parse + validate index.md frontmatter, build STAC-shaped
GeoJSON Features.

Single home for what was previously duplicated across `scripts/generate_geojson.py`
and `campsite_sync/sync.py`.

The Feature shape follows the STAC Item convention — stable id, geometry,
`properties.datetime`, `properties.summary`, `links[]`, `assets{}` — so the
catalog is a drop-in to a STAC API later. See data/CLAUDE.md for the contract.
"""

from __future__ import annotations

import re
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import yaml

AGENCIES = ["blm", "nps", "usfs", "wa-state-parks"]
VALID_TYPES = {"tent", "rv", "walk-in", "cabin", "bike-in", "parking", "boat-in", "group"}

MONTH_MAP = {
    "january": 1, "february": 2, "march": 3, "april": 4,
    "may": 5, "june": 6, "july": 7, "august": 8,
    "september": 9, "october": 10, "november": 11, "december": 12,
}

WA_LAT = (45.0, 49.5)
WA_LNG = (-125.0, -116.0)


def parse_frontmatter(text: str) -> dict:
    """Parse YAML frontmatter + plain-text body from an index.md."""
    match = re.match(r"^---\n(.*?)\n---\n?(.*)", text, re.DOTALL)
    if not match:
        raise ValueError("No frontmatter block found")
    block, body = match.group(1), match.group(2).strip()

    try:
        result = yaml.safe_load(block) or {}
    except yaml.YAMLError as e:
        raise ValueError(f"YAML parse error: {e}")

    result["_notes"] = body or None
    return result


def validate(fm: dict, path: Path) -> list[str]:
    """Return a list of validation error strings (empty = valid)."""
    errors: list[str] = []

    for field in ["name", "agency", "agency_short", "lat", "lng",
                  "sites", "types", "reservable", "availability_windows"]:
        if fm.get(field) is None:
            errors.append(f"missing required field: {field}")

    lat, lng = fm.get("lat"), fm.get("lng")
    if lat is not None and not (WA_LAT[0] <= lat <= WA_LAT[1]):
        errors.append(f"lat {lat} outside WA range {WA_LAT}")
    if lng is not None and not (WA_LNG[0] <= lng <= WA_LNG[1]):
        errors.append(f"lng {lng} outside WA range {WA_LNG}")

    windows = fm.get("availability_windows")
    if isinstance(windows, list):
        for i, w in enumerate(windows):
            if not w.get("start") or not w.get("end"):
                errors.append(f"availability_windows[{i}] requires 'start' and 'end' dates")
    elif windows is not None:
        errors.append("availability_windows must be a list")

    for t in fm.get("types") or []:
        if t not in VALID_TYPES:
            errors.append(f"unknown type '{t}' — valid: {sorted(VALID_TYPES)}")

    rid = fm.get("rec_gov_id")
    if rid is not None:
        if isinstance(rid, int):
            pass
        elif isinstance(rid, str) and rid.isdigit():
            pass
        else:
            errors.append(f"rec_gov_id '{rid}' must be a numeric string or integer")

    wid = fm.get("resource_location_id")
    if wid is not None and not isinstance(wid, int):
        errors.append(f"resource_location_id '{wid}' must be an integer")

    return errors


def open_date_to_month(val: Any) -> int | None:
    if not val:
        return None
    return MONTH_MAP.get(str(val).strip().split()[0].lower())


def campsite_id_for(fm: dict) -> str:
    """Stable join key: `{agency_short}/{slug-of-name}`."""
    slug = (
        fm["name"].lower()
        .replace(" ", "-")
        .replace("'", "")
        .replace("(", "")
        .replace(")", "")
    )
    return f"{fm['agency_short']}/{slug}"


def _agency_for(short: str) -> str | None:
    """Map agency_short to a STAC-style provider name."""
    return {
        "blm": "Bureau of Land Management",
        "nps": "National Park Service",
        "usfs": "US Forest Service",
        "wa-state-parks": "Washington State Parks",
    }.get(short)


def build_feature(fm: dict, *, summary: dict | None = None,
                  refreshed_at: str | None = None) -> dict:
    """
    Build a STAC-Item-shaped GeoJSON Feature.

    Parameters
    ----------
    fm : parsed frontmatter dict (as returned by parse_frontmatter).
    summary : optional dict with availability rollup
        ({avg_available_pct, dates_tracked, last_recalc, ...}).
        Threaded into properties.summary for at-a-glance map rendering.
    refreshed_at : ISO-8601 timestamp string for properties.datetime.
                   Defaults to "now" UTC.
    """
    if refreshed_at is None:
        refreshed_at = datetime.now(timezone.utc).isoformat(timespec="seconds")

    cid = campsite_id_for(fm)
    windows = fm.get("availability_windows") or []
    for w in windows:
        if "site_total_count" not in w:
            w["site_total_count"] = fm.get("sites", 0)
        if "reserved_count" not in w:
            w["reserved_count"] = 0

    links: list[dict] = []
    if fm.get("reservation_url"):
        links.append({
            "rel": "reservation",
            "href": fm["reservation_url"],
            "type": "text/html",
            "title": "Reserve",
        })
    if fm.get("official_url"):
        links.append({
            "rel": "official",
            "href": fm["official_url"],
            "type": "text/html",
            "title": "Official page",
        })

    properties: dict[str, Any] = {
        "id":                   cid,
        "datetime":             refreshed_at,
        "name":                 fm["name"],
        "agency":               fm["agency"],
        "agency_short":         fm["agency_short"],
        "provider":             _agency_for(fm["agency_short"]),
        "sites":                fm["sites"],
        "types":                fm["types"],
        "reservable":           fm["reservable"],
        "year_round":           fm.get("year_round"),
        "open_month":           open_date_to_month(fm.get("open_date")),
        "availability_windows": windows,
        "rec_gov_id":           fm.get("rec_gov_id"),
        "wa_park_id":           fm.get("resource_location_id"),
        "notes":                fm.get("_notes"),
        # Legacy flat URL fields kept for one release while the frontend
        # migrates to reading from links[]; remove next.
        "reservation_url":      fm.get("reservation_url"),
        "official_url":         fm.get("official_url"),
    }
    if summary is not None:
        properties["summary"] = summary

    return {
        "type": "Feature",
        "id": cid,
        "geometry": {
            "type": "Point",
            "coordinates": [fm["lng"], fm["lat"]],
        },
        "properties": properties,
        "links": links,
        "assets": {},
    }
