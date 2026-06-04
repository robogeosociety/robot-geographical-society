"""Leakage-safe evaluation of C1 (baseline) vs C2 (hazard model).

Split is by **target_date** (PREDICT.md §7): a cell's entire burn-down lives in
one fold, so a date's curve never leaks across train/test. Reports AUC, Brier,
and ECE for both the cohort-marginal baseline (C1) and the logistic hazard (C2).

Demo:  uv run --with numpy python predict/evaluate.py
       (generates synthetic data, runs the pipeline through C0, prints metrics)
"""
from __future__ import annotations

import json

import numpy as np

import hazard
import metrics
import survival


def split_by_target_date(rows, test_frac: float = 0.3, seed: int = 0):
    dates = sorted({r.target_date for r in rows})
    rng = np.random.default_rng(seed)
    mask = rng.permutation(len(dates))
    n_test = max(1, int(len(dates) * test_frac))
    test_dates = {dates[i] for i in mask[:n_test]}
    train = [r for r in rows if r.target_date not in test_dates]
    test = [r for r in rows if r.target_date in test_dates]
    return train, test


def _cohort(r):
    return survival.is_weekend(r.target_date)


def evaluate(rows) -> dict:
    train, test = split_by_target_date(rows)

    # C1 baseline: predict each row's hazard as its cohort's train event-rate.
    rate = {}
    g: dict = {}
    for r in train:
        g.setdefault(_cohort(r), []).append(r.event)
    for k, ev in g.items():
        rate[k] = float(np.mean(ev))
    overall = float(np.mean([r.event for r in train]))
    p_c1 = np.array([rate.get(_cohort(r), overall) for r in test])

    # C2: logistic hazard on features.
    Xtr, ytr, _ = hazard.featurize(train)
    Xte, yte, _ = hazard.featurize(test)
    model = hazard.LogisticHazard().fit(Xtr, ytr)
    p_c2 = model.predict_proba(Xte)

    return {
        "n_train_rows": len(train), "n_test_rows": len(test),
        "test_event_rate": round(float(yte.mean()), 4),
        "c1_baseline": _scores(yte, p_c1),
        "c2_hazard": _scores(yte, p_c2),
    }


def _scores(y, p) -> dict:
    return {
        "auc": round(metrics.auc(y, p), 4),
        "brier": round(metrics.brier(y, p), 5),
        "ece": round(metrics.expected_calibration_error(y, p), 5),
    }


def main() -> int:
    import synth
    from person_period import build_person_period

    snaps, windows = synth.generate(seed=7)
    rows, summary = build_person_period(snaps, windows)
    print("C0 summary:", json.dumps(summary))

    cells = survival.to_cell_survival(rows)
    km = survival.km_by_cohort(cells, lambda c: c["is_weekend"])
    print("\nC1 Kaplan–Meier (days-since-release):")
    for weekend, (t, s) in sorted(km.items()):
        label = "weekend" if weekend else "weekday"
        print(f"  {label:8s} median ETA = {survival.median_survival(t, s):.0f}d, "
              f"S(30)={survival.survival_at(t, s, 30):.2f}")

    print("\nC2 vs C1 (leakage-safe, split by target_date):")
    print(json.dumps(evaluate(rows), indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
