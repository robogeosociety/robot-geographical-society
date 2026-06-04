import sys
import pathlib

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent.parent))

import readiness  # noqa: E402
from person_period import Row  # noqa: E402


def _row(cg, tgt, event=0):
    return Row(campground_id=cg, site_id="s0", target_date=tgt, obs_date="2026-06-01",
               interval_days=1, days_since_release=10, lead_days=20, agency="x",
               kind="rec", site_type=None, loop=None, event=event, censored=0)


def test_empty_history_reads_zero():
    r = readiness.readiness([], {"cells": 100, "events": 0})
    assert r["readiness"] == 0.0
    assert r["band"] == "insufficient"


def test_one_component_near_zero_holds_gauge_low():
    # Lots of events + depth but almost no coverage → gauge stays low.
    rows = [_row("cg0", "2026-07-04", event=1) for _ in range(50)]
    r = readiness.readiness(rows, {"cells": 10000, "events": 500})
    assert r["components"]["coverage"] < 0.01
    assert r["readiness"] < 0.1


def test_full_history_reaches_reliable():
    rows = []
    for c in range(200):
        for _ in range(readiness.DEPTH_TARGET):       # depth per cell
            rows.append(_row(f"cg{c}", "2026-07-04"))
    summary = {"cells": 200, "events": readiness.EVENTS_TARGET}
    r = readiness.readiness(rows, summary)
    assert r["components"] == {"event_score": 1.0, "coverage": 1.0, "depth_score": 1.0}
    assert r["readiness"] == 1.0
    assert r["band"] == "reliable"
