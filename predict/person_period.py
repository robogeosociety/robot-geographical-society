"""C0 — person-period (site-date-period) table builder for PREDICT.md.

Turns the daily `sites/<date>/<id>.json` snapshots into the discrete-time
survival table described in PREDICT.md §4: one row per
`(campground, site, target_date, observation interval)` while the cell is
*at risk* (still `available`). The event is the first `available -> reserved`
transition; cells that end still available are right-censored.

Pure stdlib so it is trivially testable; Parquet/pandas output is an optional
lazy import. Reads a local mirror of the R2 `sites/` prefix; the S3 loader is a
later concern (kept out so C0 has no cloud dependency).

CLI:  uv run python predict/person_period.py <sites_dir> <campsites.json> [out.csv]
"""
from __future__ import annotations

import csv
import json
import pathlib
import sys
from collections import Counter
from dataclasses import dataclass, asdict
from datetime import date, timedelta

STATUSES = ("available", "reserved", "other")


@dataclass
class Row:
    campground_id: str
    site_id: str
    target_date: str
    obs_date: str
    interval_days: int
    days_since_release: int | None
    lead_days: int
    agency: str
    kind: str
    site_type: str | None
    loop: str | None
    event: int          # 1 = available -> reserved within this interval
    censored: int       # 1 = available -> other (lost to follow-up) ends the interval


# ---- campsites.json → booking-advance lookup -------------------------------

def load_advance_windows(campsites_path: str | pathlib.Path) -> dict[str, list[tuple[str, str, int]]]:
    """provider id (rec_gov_id / wa_park_id, as str) → [(start_mmdd, end_mmdd, advance_days)]."""
    doc = json.loads(pathlib.Path(campsites_path).read_text())
    feats = doc.get("features", doc) if isinstance(doc, dict) else doc
    out: dict[str, list[tuple[str, str, int]]] = {}
    for f in feats:
        p = f.get("properties", f)
        windows = [
            (w.get("start"), w.get("end"), w.get("booking_advance_days"))
            for w in (p.get("availability_windows") or [])
            if w.get("booking_advance_days") is not None
        ]
        if not windows:
            continue
        for key in (p.get("rec_gov_id"), p.get("wa_park_id")):
            if key is not None:
                out[str(key)] = windows
    return out


def release_advance(windows: list[tuple[str, str, int]] | None, target: date) -> int | None:
    """Booking-advance days for the window covering `target` (by MM-DD), else the first."""
    if not windows:
        return None
    mmdd = f"{target.month:02d}-{target.day:02d}"
    for start, end, adv in windows:
        if start and end and start <= mmdd <= end:
            return adv
    return windows[0][2]


# ---- core builder ----------------------------------------------------------

def build_person_period(snapshots, windows_by_id):
    """snapshots: iterable of parsed site-file dicts. Returns (rows, summary)."""
    # (cg, site, target_date) -> {obs_date: status}; plus per-cell static meta.
    obs: dict[tuple[str, str, str], dict[str, str]] = {}
    meta: dict[tuple[str, str, str], dict] = {}
    for snap in snapshots:
        cg = str(snap["id"])
        agency, kind = snap.get("agency"), snap.get("kind")
        for site_id, site in (snap.get("sites") or {}).items():
            for target_date, status in (site.get("by_date") or {}).items():
                key = (cg, str(site_id), target_date)
                cell = obs.setdefault(key, {})
                # one snapshot per collection day; last write wins on dupes.
                cell[snap["collected_date"]] = status if status in STATUSES else "other"
                meta.setdefault(key, {
                    "agency": agency, "kind": kind,
                    "site_type": site.get("type"), "loop": site.get("loop"),
                })

    rows: list[Row] = []
    outcomes: Counter = Counter()
    for (cg, site_id, target_date), series in obs.items():
        m = meta[(cg, site_id, target_date)]
        tgt = date.fromisoformat(target_date)
        adv = release_advance(windows_by_id.get(cg), tgt)
        release = tgt - timedelta(days=adv) if adv is not None else None
        dates = sorted(series)
        had_available = any(series[d] == "available" for d in dates)
        sold_out = lost = False

        for k in range(len(dates) - 1):
            cur, nxt = series[dates[k]], series[dates[k + 1]]
            if cur != "available":
                continue
            d0 = date.fromisoformat(dates[k])
            event = 1 if nxt == "reserved" else 0
            cens = 1 if nxt == "other" else 0
            rows.append(Row(
                campground_id=cg, site_id=site_id, target_date=target_date,
                obs_date=dates[k],
                interval_days=(date.fromisoformat(dates[k + 1]) - d0).days,
                days_since_release=(d0 - release).days if release else None,
                lead_days=(tgt - d0).days,
                agency=m["agency"], kind=m["kind"],
                site_type=m["site_type"], loop=m["loop"],
                event=event, censored=cens,
            ))
            if nxt == "reserved":
                sold_out = True
                break
            if nxt == "other":
                lost = True
                break

        if sold_out:
            outcomes["sold_out"] += 1
        elif lost:
            outcomes["censored_lost"] += 1
        elif had_available:
            outcomes["censored_run_end"] += 1
        else:
            outcomes["never_available"] += 1

    summary = {
        "cells": len(obs),
        "rows": len(rows),
        "events": sum(r.event for r in rows),
        "event_rate": round(sum(r.event for r in rows) / len(rows), 4) if rows else 0.0,
        "outcomes": dict(outcomes),
    }
    return rows, summary


# ---- IO --------------------------------------------------------------------

def iter_local_snapshots(sites_dir: str | pathlib.Path):
    """Walk a local mirror of R2 `sites/`: <root>/<date>/<id>.json (any depth)."""
    for p in sorted(pathlib.Path(sites_dir).rglob("*.json")):
        yield json.loads(p.read_text())


def rows_to_csv(rows: list[Row], out_path: str | pathlib.Path) -> None:
    fields = list(Row.__dataclass_fields__)
    with open(out_path, "w", newline="") as fh:
        w = csv.DictWriter(fh, fieldnames=fields)
        w.writeheader()
        for r in rows:
            w.writerow(asdict(r))


def main(argv: list[str]) -> int:
    if len(argv) < 3:
        print(__doc__)
        return 2
    sites_dir, campsites_path = argv[1], argv[2]
    out = argv[3] if len(argv) > 3 else "person_period.csv"
    windows = load_advance_windows(campsites_path)
    rows, summary = build_person_period(iter_local_snapshots(sites_dir), windows)
    rows_to_csv(rows, out)
    print(json.dumps(summary, indent=2))
    print(f"wrote {len(rows)} rows -> {out}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))
