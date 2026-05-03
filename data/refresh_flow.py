"""
CampsiteRefreshFlow — Metaflow orchestration for the campsite data refresh.

Steps:
    start → partition_by_agency → [fetch_agency * N agencies] → join_agencies
        → write_to_db → recalculate_metrics → write_outputs → end

Two canonical outputs:
    1. data/campsites.json           — STAC-Item-shaped GeoJSON (live map)
    2. data/availability.db          — SQLite time-series (deep history,
                                       forecasts, future per-site detail)
    + derived web/public/availability.json for the browser popup.

Joined by stable campsite id (`{agency_short}/{slug}`).

Run:
    uv run refresh                              # full refresh
    uv run refresh --skip-availability          # offline; only validate + GeoJSON
    uv run refresh --only "panorama-point"      # filter to id substring (test mode)
    uv run refresh --max-workers 2              # cross-branch parallelism
"""

from __future__ import annotations

import json
import sqlite3
import sys
import tomllib
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
from pathlib import Path

from metaflow import FlowSpec, Parameter, catch, retry, step
from tenacity import retry as tn_retry
from tenacity import stop_after_attempt, wait_exponential

DATA_DIR = Path(__file__).resolve().parent
DB_PATH = DATA_DIR / "availability.db"
TOML_PATH = DATA_DIR / "campsites.toml"
GEOJSON_OUT = DATA_DIR / "campsites.json"
WEB_OUT_DIR = DATA_DIR.parent / "web" / "public"

# Per-agency concurrency: WA Parks API is single-threaded due to WAF cookies.
AGENCY_WORKERS = {"rec_gov": 4, "wa_parks": 1}


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


def _agency_for(fm: dict) -> str | None:
    """Map a campsite to the agency branch it should be fetched in."""
    if fm.get("rec_gov_id") is not None:
        return "rec_gov"
    if fm.get("resource_location_id") is not None:
        return "wa_parks"
    return None


@tn_retry(stop=stop_after_attempt(3),
          wait=wait_exponential(multiplier=2, min=2, max=20),
          reraise=True)
def _fetch_rec_gov(fm: dict, months: int) -> dict:
    from campsite_sync.rec_gov import fetch_availability
    return fetch_availability(str(fm["rec_gov_id"]), months=months)


@tn_retry(stop=stop_after_attempt(3),
          wait=wait_exponential(multiplier=2, min=2, max=20),
          reraise=True)
def _fetch_wa_parks(fm: dict, cookies: str, months: int) -> dict:
    from campsite_sync.wa_state_parks import fetch_availability
    return fetch_availability(fm["resource_location_id"], months=months, cookies=cookies)


# ---------------------------------------------------------------------------
# Flow
# ---------------------------------------------------------------------------

class CampsiteRefreshFlow(FlowSpec):
    """Refresh campsite metadata and availability into the two canonical outputs."""

    skip_availability = Parameter(
        "skip-availability",
        help="Skip live availability fetch; only validate + write GeoJSON",
        default=False, is_flag=True,
    )
    months = Parameter(
        "months",
        help="Months of forward availability to fetch per campsite",
        default=6, type=int,
    )
    only = Parameter(
        "only",
        help="Substring filter on campsite id (e.g. 'panorama-point') for test runs",
        default="",
    )

    @step
    def start(self):
        """Validate index.md files; populate the campsites table; pre-warm WA cookies."""
        from campsite_sync.db import _connect, clear_campsites, write_campsite

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
        self.refreshed_at = datetime.now(timezone.utc).isoformat(timespec="seconds")

        clear_campsites(DB_PATH)
        for fm in parsed:
            write_campsite(DB_PATH, fm["_campsite_id"], fm)
        # Trigger schema migrations on first connect.
        _connect(DB_PATH).close()
        print(f"start: validated {len(parsed)} campsite(s); SQLite at {DB_PATH}")

        # Pre-warm WA Parks cookies once if any WA target is in scope and we
        # actually intend to fetch.
        wa_targets = [fm for fm in parsed if _agency_for(fm) == "wa_parks"]
        self.wa_cookies = ""
        if wa_targets and not self.skip_availability:
            from campsite_sync.wa_state_parks import get_session_cookies
            print(f"start: pre-warming WA Parks session for {len(wa_targets)} target(s)...")
            try:
                self.wa_cookies = get_session_cookies()
            except Exception as exc:
                print(f"  warning: WA session failed: {exc}", file=sys.stderr)

        self.parsed = parsed
        self.targets_by_agency: dict[str, list[dict]] = {"rec_gov": [], "wa_parks": []}
        for fm in parsed:
            agency = _agency_for(fm)
            if agency:
                self.targets_by_agency[agency].append(fm)
        for agency, items in self.targets_by_agency.items():
            print(f"  {agency}: {len(items)} target(s)")

        self.next(self.partition_by_agency)

    @step
    def partition_by_agency(self):
        """Fan out: one parallel branch per agency source. Always both branches
        so the DAG shape is static; an empty agency just produces zero results."""
        self.agencies = ["rec_gov", "wa_parks"]
        self.next(self.fetch_agency, foreach="agencies")

    @retry(times=2)
    @catch(var="agency_error")
    @step
    def fetch_agency(self):
        """Per-agency parallel fetch. Per-target failures are caught and recorded."""
        agency = self.input
        targets = [] if self.skip_availability else self.targets_by_agency.get(agency, [])
        workers = AGENCY_WORKERS.get(agency, 1)
        print(f"fetch_agency[{agency}]: {len(targets)} target(s), {workers} worker(s)")
        if not targets:
            self.results = []
            self.agency = agency
            self.next(self.join_agencies)
            return

        def _one(fm: dict) -> dict:
            cid = fm["_campsite_id"]
            try:
                if agency == "rec_gov":
                    payload = _fetch_rec_gov(fm, months=self.months)
                elif agency == "wa_parks":
                    if not self.wa_cookies:
                        raise RuntimeError("missing WA Parks session cookies")
                    payload = _fetch_wa_parks(fm, self.wa_cookies, months=self.months)
                else:
                    raise RuntimeError(f"unknown agency {agency}")
                return {
                    "campsite_id": cid,
                    "name": fm["name"],
                    "agency": agency,
                    "by_date": payload.get("by_date", {}),
                    "total_sites": payload.get("total_sites") or fm.get("sites"),
                    "summary": {
                        "first_available": payload.get("first_available"),
                        "season_open": payload.get("season_open"),
                        "season_close": payload.get("season_close"),
                    },
                    "error": None,
                }
            except Exception as exc:
                print(f"  ✗ {cid}: {exc}", file=sys.stderr)
                return {
                    "campsite_id": cid,
                    "name": fm["name"],
                    "agency": agency,
                    "by_date": {},
                    "total_sites": fm.get("sites"),
                    "summary": {},
                    "error": str(exc),
                }

        results: list[dict] = []
        if workers <= 1:
            for fm in targets:
                results.append(_one(fm))
        else:
            with ThreadPoolExecutor(max_workers=workers) as ex:
                results = list(ex.map(_one, targets))

        ok = sum(1 for r in results if not r["error"])
        print(f"fetch_agency[{agency}]: {ok}/{len(results)} succeeded")
        self.results = results
        self.agency = agency
        self.next(self.join_agencies)

    @step
    def join_agencies(self, inputs):
        """Combine per-agency results."""
        self.merge_artifacts(inputs, include=["geojson_features", "parsed",
                                              "refreshed_at", "skip_availability"])
        self.all_results = []
        self.per_agency_status: dict[str, dict] = {}
        for inp in inputs:
            agency = inp.agency
            results = inp.results
            self.all_results.extend(results)
            ok = sum(1 for r in results if not r["error"])
            err = len(results) - ok
            self.per_agency_status[agency] = {"ok": ok, "error": err,
                                              "branch_error": getattr(inp, "agency_error", None)}
        print(f"join_agencies: {sum(s['ok'] for s in self.per_agency_status.values())} ok, "
              f"{sum(s['error'] for s in self.per_agency_status.values())} per-target errors")
        self.next(self.write_to_db)

    @step
    def write_to_db(self):
        """Upsert per-date {available_count, total_sites} for every successful result."""
        from campsite_sync.db import write_availability
        n = 0
        for r in self.all_results:
            if not r["by_date"]:
                continue
            n += write_availability(DB_PATH, r["campsite_id"], r["by_date"],
                                    total_sites=r.get("total_sites"))
        print(f"write_to_db: {n} (campsite, date) row(s) upserted")
        self.next(self.recalculate_metrics)

    @step
    def recalculate_metrics(self):
        """Compute available_pct on every row + per-campsite summary aggregate."""
        from campsite_sync.db import _connect
        from campsite_sync.metrics import recompute_summary, update_pct_column

        conn = _connect(DB_PATH)
        with conn:
            n_pct = update_pct_column(conn)
            n_sum = recompute_summary(conn)
        conn.close()
        print(f"recalculate_metrics: pct on {n_pct} row(s); summary for {n_sum} campsite(s)")
        self.next(self.write_outputs)

    @step
    def write_outputs(self):
        """Emit the two canonical outputs (and the derived availability.json)."""
        from campsite_sync.metrics import read_summary
        from campsite_sync.db import _connect, export_all

        # Thread the per-campsite summary into properties.summary so the GeoJSON
        # carries a recent rollup without the full time-series.
        if not getattr(self, "skip_availability", False):
            conn = _connect(DB_PATH)
            summary_by_id = read_summary(conn)
            conn.close()
            for f in self.geojson_features:
                cid = f["properties"]["id"]
                if cid in summary_by_id:
                    f["properties"]["summary"] = summary_by_id[cid]

        GEOJSON_OUT.write_text(json.dumps(
            {"type": "FeatureCollection", "features": self.geojson_features},
            indent=2,
        ) + "\n")
        print(f"write_outputs: GeoJSON → {GEOJSON_OUT} ({len(self.geojson_features)} features)")

        if not getattr(self, "skip_availability", False):
            data = export_all(DB_PATH)
            if data:
                WEB_OUT_DIR.mkdir(parents=True, exist_ok=True)
                avail_path = WEB_OUT_DIR / "availability.json"
                avail_path.write_text(json.dumps(data, separators=(",", ":")) + "\n")
                print(f"write_outputs: availability → {avail_path} "
                      f"({len(data)} campsites, "
                      f"{sum(len(v) for v in data.values())} date entries)")

        self.next(self.end)

    @step
    def end(self):
        """Print per-agency success/failure report."""
        if not getattr(self, "skip_availability", False):
            for agency, s in getattr(self, "per_agency_status", {}).items():
                tag = " (BRANCH FAILED)" if s.get("branch_error") else ""
                print(f"  {agency}: {s['ok']} ok, {s['error']} error(s){tag}")
            failed = [r for r in self.all_results if r["error"]]
            if failed:
                print("Failed campsites:")
                for r in failed:
                    print(f"  - {r['campsite_id']} ({r['agency']}): {r['error']}")
        print("done.")


def main():
    """uv run refresh — entry point."""
    CampsiteRefreshFlow()


if __name__ == "__main__":
    CampsiteRefreshFlow()
