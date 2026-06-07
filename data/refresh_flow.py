"""
CampsiteRefreshFlow — Metaflow orchestration for the campsite metadata refresh.

Steps:
    start (validate index.md files) → write_outputs (GeoJSON) → end

Single canonical output:
    data/campsites.json — STAC-Item-shaped GeoJSON (live map source)

Joined by stable campsite id (`{agency_short}/{slug}`).

Live per-site, per-date availability is no longer fetched here — the Cloudflare
collector (`backend/`) banks daily snapshots to the `campsite-raw` R2 bucket.
This flow only validates the editorial markdown and compiles the GeoJSON the
map imports.

Run:
    uv run refresh run                          # validate + write GeoJSON
    uv run refresh run --only "panorama-point"  # filter to id substring (test mode)
"""

from __future__ import annotations

import json
import sys
import tomllib
from datetime import datetime, timezone
from pathlib import Path

from metaflow import FlowSpec, Parameter, step

DATA_DIR = Path(__file__).resolve().parent
TOML_PATH = DATA_DIR / "campsites.toml"
GEOJSON_OUT = DATA_DIR / "campsites.json"


# ---------------------------------------------------------------------------
# Helpers (module-level so Metaflow steps stay declarative)
# ---------------------------------------------------------------------------

def _load_targets() -> tuple[list[dict], list[dict], list[str]]:
    """
    Read campsites.toml + every referenced index.md, validate, and return:
        (parsed_frontmatters, geojson_features, errors)
    """
    from campsite_sync.registry import (
        build_feature, campsite_id_for, parse_frontmatter, validate,
    )
    from campsite_sync.quality import calculate_score

    with open(TOML_PATH, "rb") as f:
        config = tomllib.load(f)

    refreshed_at = datetime.now(timezone.utc).isoformat(timespec="seconds")

    parsed: list[dict] = []
    features: list[dict] = []
    errors: list[str] = []

    for entry in config.get("campsites", []):
        rel_path = entry.get("path")
        if not rel_path:
            continue
        path = DATA_DIR / rel_path
        if not path.exists():
            errors.append(f"{rel_path}: not found")
            continue
        try:
            fm = parse_frontmatter(path.read_text())
        except Exception as exc:
            errors.append(f"{rel_path}: parse error: {exc}")
            continue
        errs = validate(fm, path)
        if errs:
            errors.append(f"{rel_path}: " + "; ".join(errs))
            continue
        cid = campsite_id_for(fm)
        fm["_campsite_id"] = cid
        fm["_quality_score"] = calculate_score({**fm, "_notes": fm.get("_notes")})
        parsed.append(fm)
        features.append(build_feature(fm, refreshed_at=refreshed_at))

    features.sort(key=lambda f: (f["properties"]["agency_short"], f["properties"]["name"]))
    return parsed, features, errors


# ---------------------------------------------------------------------------
# Flow
# ---------------------------------------------------------------------------

class CampsiteRefreshFlow(FlowSpec):
    """Validate the editorial markdown and compile data/campsites.json."""

    only = Parameter(
        "only",
        help="Substring filter on campsite id (e.g. 'panorama-point') for test runs",
        default="",
    )

    @step
    def start(self):
        """Validate index.md files and stage the GeoJSON features."""
        parsed, features, errors = _load_targets()
        if errors:
            for e in errors:
                print(f"  validation: {e}", file=sys.stderr)
            raise RuntimeError(f"{len(errors)} campsite file(s) failed validation")

        if self.only:
            needle = self.only.lower()
            parsed = [fm for fm in parsed if needle in fm["_campsite_id"].lower()]
            features = [
                f for f in features if needle in f["properties"]["id"].lower()
            ]
            print(f"--only filter '{self.only}' → {len(parsed)} campsite(s)")

        self.geojson_features = features
        print(f"start: validated {len(parsed)} campsite(s)")
        self.next(self.write_outputs)

    @step
    def write_outputs(self):
        """Emit the canonical GeoJSON output."""
        GEOJSON_OUT.write_text(json.dumps(
            {"type": "FeatureCollection", "features": self.geojson_features},
            indent=2,
        ) + "\n")
        print(f"write_outputs: GeoJSON → {GEOJSON_OUT} ({len(self.geojson_features)} features)")
        self.next(self.end)

    @step
    def end(self):
        """Done."""
        print("done.")


def main():
    """uv run refresh — entry point."""
    CampsiteRefreshFlow()


if __name__ == "__main__":
    CampsiteRefreshFlow()
