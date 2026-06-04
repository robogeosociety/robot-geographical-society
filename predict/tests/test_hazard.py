import sys
import pathlib

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent.parent))

import numpy as np  # noqa: E402
import hazard  # noqa: E402
import metrics  # noqa: E402
import synth  # noqa: E402
import evaluate  # noqa: E402
from person_period import build_person_period  # noqa: E402


def test_logistic_recovers_planted_signal():
    rng = np.random.default_rng(0)
    f = rng.normal(size=(800, 1))
    y = (rng.random(800) < 1 / (1 + np.exp(-(2.0 * f[:, 0] - 0.5)))).astype(float)
    m = hazard.LogisticHazard().fit(f, y)
    assert metrics.auc(y, m.predict_proba(f)) > 0.85


def test_survival_curve_and_median_eta():
    s = hazard.survival_curve([0.5, 0.5, 0.5])
    assert np.allclose(s, [0.5, 0.25, 0.125])
    # S drops to ≤0.5 at the first interval (time 10 here).
    assert hazard.median_eta([10, 11, 12], [0.5, 0.5, 0.5]) == 10
    assert hazard.median_eta([10, 11], [0.1, 0.1]) == float("inf")


def test_featurize_shapes():
    snaps, windows = synth.generate(seed=1, n_campgrounds=10,
                                    n_target_dates=12, collect_days=60)
    rows, _ = build_person_period(snaps, windows)
    X, y, meta = hazard.featurize(rows)
    assert X.shape == (len(rows), len(hazard.FEATURES))
    assert len(y) == len(rows) == len(meta)


def test_c2_beats_c1_baseline():
    snaps, windows = synth.generate(seed=5, n_campgrounds=40,
                                    n_target_dates=30, collect_days=80)
    rows, _ = build_person_period(snaps, windows)
    res = evaluate.evaluate(rows)
    # acceptance gate: hazard model out-discriminates the cohort baseline and is
    # at least as well calibrated (lower Brier).
    assert res["c2_hazard"]["auc"] > res["c1_baseline"]["auc"]
    assert res["c2_hazard"]["brier"] <= res["c1_baseline"]["brier"]
