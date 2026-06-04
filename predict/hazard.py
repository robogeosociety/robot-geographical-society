"""C2 — discrete-time hazard model (PREDICT.md §6).

Penalized logistic regression on the C0 person-period rows: features →
P(sell out in this interval | survived to it). This is the interpretable
"reference" baseline the doc names; GBT is a later drop-in. numpy-only (IRLS-free
batch gradient descent with L2), so it has no sklearn dependency.

From per-interval hazards we recover a cell's survival curve S(t)=Π(1−h) and a
median sell-out ETA.
"""
from __future__ import annotations

from datetime import date

import numpy as np

FEATURES = ["lead_days", "days_since_release", "interval_days",
            "is_weekend", "is_hot", "kind_rec"]


def _dow_weekend(target_date: str) -> float:
    return 1.0 if date.fromisoformat(target_date).weekday() >= 5 else 0.0


def featurize(rows):
    """C0 Rows → (X, y, meta). Missing days_since_release filled with the median."""
    dsr = np.array([(r.days_since_release if r.days_since_release is not None else np.nan)
                    for r in rows], float)
    med = np.nanmedian(dsr) if np.isfinite(dsr).any() else 0.0
    dsr = np.where(np.isnan(dsr), med, dsr)
    X = np.column_stack([
        np.array([r.lead_days for r in rows], float),
        dsr,
        np.array([r.interval_days for r in rows], float),
        np.array([_dow_weekend(r.target_date) for r in rows], float),
        np.array([1.0 if (r.site_type or "").upper() == "HOT" else 0.0 for r in rows], float),
        np.array([1.0 if r.kind == "rec" else 0.0 for r in rows], float),
    ])
    y = np.array([r.event for r in rows], float)
    meta = [(r.campground_id, r.site_id, r.target_date) for r in rows]
    return X, y, meta


def _sigmoid(z):
    return 1.0 / (1.0 + np.exp(-np.clip(z, -35, 35)))


class LogisticHazard:
    def __init__(self, l2: float = 1.0, lr: float = 0.5, iters: int = 4000):
        self.l2, self.lr, self.iters = l2, lr, iters

    def fit(self, X, y):
        self.mean_ = X.mean(0)
        self.std_ = X.std(0)
        self.std_[self.std_ == 0] = 1.0
        Xs = (X - self.mean_) / self.std_
        n, d = Xs.shape
        Xb = np.column_stack([np.ones(n), Xs])
        w = np.zeros(d + 1)
        for _ in range(self.iters):
            grad = Xb.T @ (_sigmoid(Xb @ w) - y) / n
            grad[1:] += self.l2 * w[1:] / n  # don't penalize the bias
            w -= self.lr * grad
        self.w_ = w
        return self

    def predict_proba(self, X):
        Xs = (X - self.mean_) / self.std_
        return _sigmoid(np.column_stack([np.ones(len(Xs)), Xs]) @ self.w_)


def survival_curve(hazards):
    """Per-interval hazards (time-ordered) → survival S(t)=Π(1−h)."""
    return np.cumprod(1.0 - np.asarray(hazards, float))


def median_eta(times, hazards) -> float:
    """First interval-start time where S drops to ≤ 0.5; inf if it never does."""
    s = survival_curve(hazards)
    below = np.where(s <= 0.5)[0]
    return float(times[below[0]]) if len(below) else float("inf")
