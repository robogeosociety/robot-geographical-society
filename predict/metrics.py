"""Evaluation metrics for the hazard model (PREDICT.md §7).

Calibration/Brier is the headline (the product is a probability); AUC measures
discrimination. numpy-only.
"""
from __future__ import annotations

import numpy as np


def brier(y, p) -> float:
    y, p = np.asarray(y, float), np.asarray(p, float)
    return float(np.mean((p - y) ** 2))


def _avg_ranks(p: np.ndarray) -> np.ndarray:
    """Ranks with ties averaged (1-based)."""
    order = np.argsort(p, kind="mergesort")
    sp = p[order]
    ranks = np.empty(len(p), float)
    i = 0
    while i < len(p):
        j = i
        while j + 1 < len(p) and sp[j + 1] == sp[i]:
            j += 1
        ranks[order[i:j + 1]] = (i + j) / 2 + 1
        i = j + 1
    return ranks


def auc(y, p) -> float:
    """ROC AUC via the Mann–Whitney U statistic; NaN if only one class present."""
    y, p = np.asarray(y, int), np.asarray(p, float)
    npos, nneg = int(np.sum(y == 1)), int(np.sum(y == 0))
    if npos == 0 or nneg == 0:
        return float("nan")
    ranks = _avg_ranks(p)
    return float((ranks[y == 1].sum() - npos * (npos + 1) / 2) / (npos * nneg))


def expected_calibration_error(y, p, bins: int = 10) -> float:
    """Mean |confidence − accuracy| over equal-width probability bins (ECE)."""
    y, p = np.asarray(y, float), np.asarray(p, float)
    edges = np.linspace(0, 1, bins + 1)
    ece = 0.0
    for lo, hi in zip(edges[:-1], edges[1:]):
        m = (p >= lo) & (p < hi if hi < 1 else p <= hi)
        if not m.any():
            continue
        ece += (m.mean()) * abs(p[m].mean() - y[m].mean())
    return float(ece)
