#!/usr/bin/env python3
"""
CLI entry point — validate index.md files and rebuild campsites.json.

Usage (from data/):
    uv run generate
    uv run generate --output /path/to/output.json
"""

import argparse
import sys
import json
import yaml
import re
import toml
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
                  "sites", "types", "reservable", "year_round"]:
        if fm.get(field) is None:
            errors.append(f"missing required field: {field}")

    lat, lng = fm.get("lat"), fm.get("lng")
    if lat is not None and not (WA_LAT[0] <= lat <= WA_LAT[1]):
        errors.append(f"lat {lat} outside WA range {WA_LAT}")
    if lng is not None and not (WA_LNG[0] <= lng <= WA_LNG[1]):
        errors.append(f"lng {lng} outside WA range {WA_LNG}")

    open_date = fm.get("open_date")
    if fm.get("year_round") and open_date is not None:
        errors.append("year_round: true but open_date is set")
    if not fm.get("year_round") and open_date is not None:
        month_name = str(open_date).split()[0].lower()
        if month_name not in MONTH_MAP:
            errors.append(f"open_date month '{month_name}' not recognised")

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

def main():
    parser = argparse.ArgumentParser(
        description="Validate campsite index.md files and rebuild campsites.json."
    )
    parser.add_argument(
        "--output",
        metavar="FILE",
        default="campsites.json",
        help="Output GeoJSON path (default: campsites.json)",
    )
    args = parser.parse_args()

    toml_path = Path("campsites.toml")
    if not toml_path.exists():
        print("Error: campsites.toml not found.", file=sys.stderr)
        sys.exit(1)

    print(f"Reading {toml_path}...")
    try:
        config = toml.load(toml_path)
    except Exception as e:
        print(f"Error parsing campsites.toml: {e}", file=sys.stderr)
        sys.exit(1)

    campsites_list = config.get("campsites", [])
    if not campsites_list:
        print("No campsites found in campsites.toml", file=sys.stderr)
        sys.exit(1)

    output = Path(args.output).resolve()

    print(f"Found {len(campsites_list)} entries in campsites.toml\n")

    # --- Parse & validate ---
    validation_errors: dict[str, list[str]] = {}
    parsed: dict[Path, dict] = {}

    for entry in campsites_list:
        rel_path = entry.get("path")
        if not rel_path:
            continue
        
        path = Path(rel_path) / "index.md"
        if not path.exists():
            validation_errors[str(path)] = ["File not found"]
            continue

        try:
            fm = parse_frontmatter(path.read_text())
            errs = validate(fm, path)
            if errs:
                validation_errors[str(path)] = errs
            else:
                parsed[path] = fm
        except Exception as exc:
            validation_errors[str(path)] = [f"parse error: {exc}"]

    if validation_errors:
        print(f"✗ {len(validation_errors)} file(s) with errors:\n", file=sys.stderr)
        for p, errs in validation_errors.items():
            print(f"  {p}", file=sys.stderr)
            for e in errs:
                print(f"    · {e}", file=sys.stderr)
        sys.exit(1)

    print(f"✓ All {len(campsites_list)} files passed validation")

    # --- Build & write GeoJSON ---
    features = sorted(
        [build_feature(fm) for fm in parsed.values()],
        key=lambda f: (f["properties"]["agency_short"], f["properties"]["name"]),
    )

    geojson = {"type": "FeatureCollection", "features": features}
    output.write_text(json.dumps(geojson, indent=2) + "\n")

    by_agency: dict[str, int] = {}
    for f in features:
        a = f["properties"]["agency_short"]
        by_agency[a] = by_agency.get(a, 0) + 1

    print(f"\n✓ {len(features)} campsites written to {output}\n")
    for agency, count in sorted(by_agency.items()):
        print(f"  {agency:20s} {count}")

if __name__ == "__main__":
    main()
