import sys
import pathlib

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent.parent))

import numpy as np  # noqa: E402
import metrics  # noqa: E402


def test_auc_perfect_and_reversed():
    y = [0, 0, 1, 1]
    assert metrics.auc(y, [0.1, 0.2, 0.8, 0.9]) == 1.0
    assert metrics.auc(y, [0.9, 0.8, 0.2, 0.1]) == 0.0


def test_auc_constant_is_half_and_single_class_is_nan():
    assert metrics.auc([0, 1, 0, 1], [0.5, 0.5, 0.5, 0.5]) == 0.5
    assert np.isnan(metrics.auc([1, 1, 1], [0.2, 0.8, 0.5]))


def test_brier_known_value():
    # (0.2-0)^2 + (0.8-1)^2 = 0.04 + 0.04, mean = 0.04
    assert abs(metrics.brier([0, 1], [0.2, 0.8]) - 0.04) < 1e-9


def test_ece_zero_when_perfectly_calibrated():
    # half the rows at p=0 (all y=0), half at p=1 (all y=1).
    y = [0] * 50 + [1] * 50
    p = [0.0] * 50 + [1.0] * 50
    assert metrics.expected_calibration_error(y, p) < 1e-9
