"""C1 — Kaplan–Meier cohort baseline (PREDICT.md §6).

Collapses the C0 person-period rows to one survival record per cell
(duration on the days-since-release clock + event flag), then estimates a
right-censoring-aware KM survival curve per cohort. This is both the EDA sanity
check and the naive benchmark C2 must beat.
"""
from __future__ import annotations

from datetime import date

import numpy as np


def is_weekend(target_date: str) -> bool:
    return date.fromisoformat(target_date).weekday() >= 5


def to_cell_survival(rows):
    """rows (C0 Row objects) → list of dicts: one (duration, event, features) per cell.

    duration is on the days-since-release clock; cells without a release date
    (days_since_release is None) are skipped — KM needs a common clock.
    """
    by_cell: dict[tuple, list] = {}
    for r in rows:
        by_cell.setdefault((r.campground_id, r.site_id, r.target_date), []).append(r)

    out = []
    for (cg, site, tgt), rs in by_cell.items():
        rs = sorted(rs, key=lambda r: r.obs_date)
        if any(r.days_since_release is None for r in rs):
            continue
        ev = next((r for r in rs if r.event == 1), None)
        if ev is not None:
            duration, event = ev.days_since_release, 1
        else:
            last = rs[-1]
            duration, event = last.days_since_release + last.interval_days, 0
        out.append({
            "campground_id": cg, "site_id": site, "target_date": tgt,
            "duration": float(duration), "event": int(event),
            "is_weekend": is_weekend(tgt), "site_type": rs[0].site_type,
            "kind": rs[0].kind,
        })
    return out


def kaplan_meier(times, events):
    """Standard KM estimator. Returns (event_times, survival) step function."""
    times, events = np.asarray(times, float), np.asarray(events, int)
    uniq = np.unique(times[events == 1])
    surv, t_out, s_out = 1.0, [], []
    for t in uniq:
        n_risk = int(np.sum(times >= t))
        d = int(np.sum((times == t) & (events == 1)))
        if n_risk == 0:
            continue
        surv *= 1 - d / n_risk
        t_out.append(t)
        s_out.append(surv)
    return np.asarray(t_out), np.asarray(s_out)


def survival_at(t_arr, s_arr, q: float) -> float:
    """S(q) from a KM step function; 1.0 before the first event time."""
    if len(t_arr) == 0:
        return 1.0
    idx = np.searchsorted(t_arr, q, side="right") - 1
    return 1.0 if idx < 0 else float(s_arr[idx])


def median_survival(t_arr, s_arr) -> float:
    """First time S(t) ≤ 0.5; inf if it never drops that far (mostly censored)."""
    below = np.where(s_arr <= 0.5)[0]
    return float(t_arr[below[0]]) if len(below) else float("inf")


def km_by_cohort(cells, cohort_fn):
    """{cohort_key: (t, S)} — KM curve per cohort."""
    groups: dict = {}
    for c in cells:
        groups.setdefault(cohort_fn(c), []).append(c)
    return {
        key: kaplan_meier([c["duration"] for c in g], [c["event"] for c in g])
        for key, g in groups.items()
    }


def cohort_event_rate(cells, cohort_fn):
    """Marginal per-cell event rate per cohort — the C2 no-skill baseline."""
    groups: dict = {}
    for c in cells:
        groups.setdefault(cohort_fn(c), []).append(c["event"])
    return {key: float(np.mean(ev)) for key, ev in groups.items()}
