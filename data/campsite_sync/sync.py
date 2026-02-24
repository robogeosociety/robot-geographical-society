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
from pathlib import Path

AGENCIES = ["blm", "nps", "usfs", "wa-state-parks"]

VALID_TYPES = {"tent", "rv", "walk-in", "cabin", "bike-in", "parking"}

MONTH_MAP = {
    "january": 1, "february": 2, "march": 3, "april": 4,
    "may": 5, "june": 6, "july": 7, "august": 8,
    "september": 9, "october": 10, "november": 11, "december": 12,
}

WA_LAT = (45.5, 49.1)
WA_LNG = (-124.9, -116.9)


def _resolve_base(base: str | Path | None) -> Path:
    """Resolve the data/ base directory from an explicit path or by auto-detection."""
    if base is not None:
        return Path(base).resolve()
    # Works whether invoked from project root or from data/
    candidate = Path("data")
    if (candidate / "campsites.json").exists():
        return candidate.resolve()
    return Path(".").resolve()


def parse_frontmatter(text: str) -> dict:
    """Parse YAML frontmatter + plain-text body from an index.md."""
    match = re.match(r"^---\n(.*?)\n---\n?(.*)", text, re.DOTALL)
    if not match:
        raise ValueError("No frontmatter block found")
    block, body = match.group(1), match.group(2).strip()

    result: dict = {}
    for line in block.splitlines():
        if ":" not in line:
            continue
        key, _, val = line.partition(":")
        key = key.strip()
        val = val.strip().split("#")[0].strip()  # strip inline comments

        if val.startswith("[") and val.endswith("]"):
            result[key] = [v.strip() for v in val[1:-1].split(",") if v.strip()]
        elif (val.startswith('"') and val.endswith('"')) or \
             (val.startswith("'") and val.endswith("'")):
            result[key] = val[1:-1]
        elif val == "true":
            result[key] = True
        elif val == "false":
            result[key] = False
        elif val == "null":
            result[key] = None
        else:
            try:
                result[key] = float(val) if "." in val else int(val)
            except ValueError:
                result[key] = val

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
    if rid is not None and not (isinstance(rid, str) and rid.isdigit()):
        errors.append(f"rec_gov_id '{rid}' must be a numeric string")

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
            "notes":            fm.get("_notes"),
        },
    }


def sync(
    base: str | Path | None = None,
    output: str | Path | None = None,
) -> dict:
    """
    Parse, validate, and rebuild campsites.json from all index.md files.

    Args:
        base:   Root data directory containing agency sub-folders. Auto-detected
                from cwd if omitted.
        output: Destination file path for the GeoJSON output. Defaults to
                campsites.json inside `base`. Any parent directories must exist.

    Returns a result dict:
        {
            "base":     Path,
            "output":   Path,
            "total":    int,
            "written":  int,
            "errors":   {path_str: [error_str, ...]},
            "by_agency": {agency_short: count},
        }

    Raises RuntimeError if any validation errors are found (matching notebook behaviour).
    """
    base_path = _resolve_base(base)
    output = Path(output).resolve() if output is not None else base_path / "campsites.json"

    # --- Collect files ---
    all_files: list[Path] = []
    for agency in AGENCIES:
        agency_dir = base_path / agency / "WA"
        if agency_dir.is_dir():
            all_files.extend(sorted(agency_dir.rglob("index.md")))

    print(f"Base directory : {base_path}")
    print(f"Output         : {output}")
    print(f"Found {len(all_files)} campsite files\n")

    # --- Parse & validate ---
    validation_errors: dict[str, list[str]] = {}
    parsed: dict[Path, dict] = {}

    for path in all_files:
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
        raise RuntimeError(
            f"{len(validation_errors)} validation error(s) — fix before syncing."
        )

    print(f"✓ All {len(all_files)} files passed validation")

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

    return {
        "base": base_path,
        "output": output,
        "total": len(all_files),
        "written": len(features),
        "errors": validation_errors,
        "by_agency": by_agency,
    }
