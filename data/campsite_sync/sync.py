"""
Campsite data sync — parse, validate, and rebuild campsites.json from index.md files.

Importable:
    from campsite_sync.sync import sync
    result = sync()                                    # auto-detects base dir
    result = sync("/path/to/data")                     # explicit data dir
    result = sync(output="/absolute/path/output.json") # custom output path

CLI:
    uv run sync-to-geojson
    uv run sync-to-geojson --output /some/other/dir/campsites.json
"""

import json
import re
import sys
import yaml
from pathlib import Path

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
    errors = []

    for field in ["name", "agency", "agency_short", "lat", "lng",
                  "sites", "types", "reservable", "season"]:
        if fm.get(field) is None:
            errors.append(f"missing required field: {field}")

    lat, lng = fm.get("lat"), fm.get("lng")
    if lat is not None and not (WA_LAT[0] <= lat <= WA_LAT[1]):
        errors.append(f"lat {lat} outside WA range {WA_LAT}")
    if lng is not None and not (WA_LNG[0] <= lng <= WA_LNG[1]):
        errors.append(f"lng {lng} outside WA range {WA_LNG}")

    season = fm.get("season")
    if season:
        if "type" not in season:
            errors.append("season missing 'type'")
        elif season["type"] == "seasonal":
            if not season.get("start") or not season.get("end"):
                errors.append("seasonal type requires 'start' and 'end' dates")

    for t in fm.get("types") or []:
        if t not in VALID_TYPES:
            errors.append(f"unknown type '{t}' — valid: {sorted(VALID_TYPES)}")

    rid = fm.get("rec_gov_id")
    if rid is not None:
        if isinstance(rid, int):
             pass # Valid
        elif isinstance(rid, str) and rid.isdigit():
             pass # Valid
        else:
             errors.append(f"rec_gov_id '{rid}' must be a numeric string or integer")

    wid = fm.get("resource_location_id")
    if wid is not None and not isinstance(wid, int):
        errors.append(f"resource_location_id '{wid}' must be an integer")

    return errors


def _open_date_to_month(val) -> int | None:
    if not val:
        return None
    return MONTH_MAP.get(str(val).strip().split()[0].lower())


def build_feature(fm: dict) -> dict:
    """Build a GeoJSON Feature from parsed frontmatter."""
    return {
        "type": "Feature",
        "geometry": {
            "type": "Point",
            "coordinates": [fm["lng"], fm["lat"]],
        },
        "properties": {
            "name":             fm["name"],
            "agency":           fm["agency"],
            "agency_short":     fm["agency_short"],
            "sites":            fm["sites"],
            "types":            fm["types"],
            "reservable":       fm["reservable"],
            "year_round":       fm["year_round"],
            "open_month":       _open_date_to_month(fm.get("open_date")),
            "reservation_url":  fm.get("reservation_url"),
            "rec_gov_id":       fm.get("rec_gov_id"),
            "wa_park_id":       fm.get("resource_location_id"),
            "availability":     fm.get("availability"),
            "notes":            fm.get("_notes"),
        },
    }
