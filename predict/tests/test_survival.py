import sys
import pathlib

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent.parent))

import numpy as np  # noqa: E402
import survival  # noqa: E402
import synth  # noqa: E402
from person_period import build_person_period  # noqa: E402


def test_kaplan_meier_hand_example():
    # times=[5,5,8,10,12], events=[1,1,0,1,1]  (8 is censored)
    t, s = survival.kaplan_meier([5, 5, 8, 10, 12], [1, 1, 0, 1, 1])
    assert list(t) == [5, 10, 12]
    assert np.allclose(s, [0.6, 0.3, 0.0])


def test_survival_at_and_median():
    t, s = survival.kaplan_meier([5, 5, 8, 10, 12], [1, 1, 0, 1, 1])
    assert survival.survival_at(t, s, 3) == 1.0     # before first event
    assert survival.survival_at(t, s, 7) == 0.6     # after t=5 only
    assert survival.median_survival(t, s) == 10     # first S ≤ 0.5


def test_median_is_inf_when_mostly_censored():
    t, s = survival.kaplan_meier([10, 11, 12], [1, 0, 0])
    assert survival.median_survival(t, s) == float("inf")


def test_cohort_ordering_weekend_burns_faster():
    snaps, windows = synth.generate(seed=3, n_campgrounds=30,
                                    n_target_dates=24, collect_days=70)
    rows, _ = build_person_period(snaps, windows)
    cells = survival.to_cell_survival(rows)
    km = survival.km_by_cohort(cells, lambda c: c["is_weekend"])
    med = {wk: survival.median_survival(*curve) for wk, curve in km.items()}
    # planted truth: weekend hazard is higher → shorter median time-to-sellout.
    assert med[True] < med[False]
