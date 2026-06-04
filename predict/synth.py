"""Synthetic availability generator with *known* hazard structure.

Real `sites/` history is still ~empty (one snapshot per cell), so C1/C2 are
validated against data with a planted ground truth: weekend, holiday-ish "hot"
sites, and time-since-release all raise the daily sell-out hazard. The generated
snapshots use the real `sites/<date>/<id>.json` shape and are fed through the
real C0 builder (`person_period.build_person_period`), so the whole pipeline is
exercised — only the *numbers* are synthetic.
"""
from __future__ import annotations

import math
from datetime import date, timedelta

ADVANCE = 180  # booking_advance_days for every synthetic campground


def _sigmoid(x: float) -> float:
    return 1.0 / (1.0 + math.exp(-x))


def generate(seed: int = 0, n_campgrounds: int = 60, n_target_dates: int = 40,
             collect_days: int = 90):
    """Returns (snapshots, windows_by_id).

    snapshots: list of site-file dicts (one per campground per collection day),
    consumable by person_period.build_person_period.
    windows_by_id: the booking-advance lookup for the same builder.
    """
    rng = _Lcg(seed)
    # Stable per-campground "hot" flag (popularity) and a target-date grid.
    hot = {c: (rng.next() < 0.4) for c in range(n_campgrounds)}
    base_target = date(2026, 7, 1)
    targets = [base_target + timedelta(days=i) for i in range(n_target_dates)]

    # Collection runs the 90 days *ending* just before the earliest stay date,
    # so every cell is observed across its post-release at-risk window.
    collect_start = base_target - timedelta(days=ADVANCE) + timedelta(days=5)
    collect_dates = [collect_start + timedelta(days=i) for i in range(collect_days)]

    # Pre-sample each cell's sell-out collection-day by walking the daily hazard.
    sold_on: dict[tuple[int, str], date | None] = {}
    for c in range(n_campgrounds):
        for tgt in targets:
            release = tgt - timedelta(days=ADVANCE)
            is_weekend = tgt.weekday() >= 5
            sell_day = None
            for cd in collect_dates:
                if cd < release or cd > tgt:
                    continue
                dsr = (cd - release).days
                # planted truth: weekend + hot + time-since-release raise hazard.
                logit = -4.2 + 1.6 * is_weekend + 1.4 * hot[c] + 0.012 * dsr
                if rng.next() < _sigmoid(logit):
                    sell_day = cd
                    break
            sold_on[(c, tgt.isoformat())] = sell_day

    snapshots = []
    for cd in collect_dates:
        for c in range(n_campgrounds):
            by_date = {}
            for tgt in targets:
                release = tgt - timedelta(days=ADVANCE)
                if cd < release:
                    by_date[tgt.isoformat()] = "other"
                else:
                    so = sold_on[(c, tgt.isoformat())]
                    by_date[tgt.isoformat()] = "reserved" if (so and cd >= so) else "available"
            snapshots.append({
                "id": f"cg{c}", "agency": "synthetic", "kind": "rec",
                "collected_date": cd.isoformat(),
                "sites": {"s0": {"label": "0", "loop": None,
                                 "type": "HOT" if hot[c] else "COLD",
                                 "use": "Overnight", "by_date": by_date}},
            })

    windows = {f"cg{c}": [("01-01", "12-31", ADVANCE)] for c in range(n_campgrounds)}
    return snapshots, windows


class _Lcg:
    """Tiny deterministic PRNG (no Math.random/global-state dependency)."""

    def __init__(self, seed: int):
        self.state = (seed * 2654435761 + 12345) & 0xFFFFFFFF

    def next(self) -> float:
        self.state = (1103515245 * self.state + 12345) & 0x7FFFFFFF
        return self.state / 0x7FFFFFFF
