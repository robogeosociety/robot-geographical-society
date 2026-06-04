"""Prediction-readiness score — the value behind the dashboard gauge.

Accurate sell-out prediction is gated on accumulating enough *observed history*,
not on having the model. This collapses the C0 output into a single 0–1 gauge
that fills as collection deepens, so the dashboard can show "how close are we to
trustworthy predictions" and gate when to take C2/C3 outputs seriously.

Three components must all progress (geometric mean, so one near-zero term holds
the gauge low):
  • events   — observed sell-outs vs the count a stable hazard fit needs
  • coverage — fraction of cells that have ≥1 at-risk interval (≥2 snapshots)
  • depth    — median intervals per active cell vs a target burn-down resolution
"""
from __future__ import annotations

from collections import Counter

# Tunable targets — first credible model, not the AUC plateau.
EVENTS_TARGET = 500
DEPTH_TARGET = 6

BANDS = ((0.33, "insufficient"), (0.80, "directional"), (1.01, "reliable"))


def _band(score: float) -> str:
    return next(name for edge, name in BANDS if score < edge)


def readiness(rows, summary, events_target: int = EVENTS_TARGET,
              depth_target: int = DEPTH_TARGET) -> dict:
    cells = summary.get("cells", 0)
    events = summary.get("events", 0)

    per_cell = Counter((r.campground_id, r.site_id, r.target_date) for r in rows)
    active = len(per_cell)
    counts = sorted(per_cell.values())
    median_depth = counts[len(counts) // 2] if counts else 0

    event_score = min(1.0, events / events_target) if events_target else 0.0
    coverage = (active / cells) if cells else 0.0
    depth_score = min(1.0, median_depth / depth_target) if depth_target else 0.0

    score = (event_score * coverage * depth_score) ** (1 / 3)
    return {
        "readiness": round(score, 4),
        "band": _band(score),
        "components": {
            "event_score": round(event_score, 4),
            "coverage": round(coverage, 4),
            "depth_score": round(depth_score, 4),
        },
        "raw": {"cells": cells, "active_cells": active, "events": events,
                "median_depth": median_depth},
    }
