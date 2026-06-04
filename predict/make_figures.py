"""Generate the *expected* (illustrative, not measured) accuracy figures for
PREDICT.md. These encode the design's hypotheses, not results — they exist so a
reviewer can see the shape we expect and challenge it before we build the model.

Run:  uv run --with numpy --with matplotlib python predict/make_figures.py
Writes PNGs into docs/predict/.
"""
from __future__ import annotations

import pathlib

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt
import numpy as np

OUT = pathlib.Path(__file__).resolve().parent.parent / "docs" / "predict"
OUT.mkdir(parents=True, exist_ok=True)

ILLUSTRATIVE = "Illustrative — expected behaviour, not measured results"


def _style(ax, title, xlabel, ylabel):
    ax.set_title(title, fontsize=12, fontweight="bold")
    ax.set_xlabel(xlabel, fontsize=10)
    ax.set_ylabel(ylabel, fontsize=10)
    ax.grid(True, alpha=0.25, linewidth=0.6)
    ax.spines[["top", "right"]].set_visible(False)


def accuracy_vs_history():
    """Skill rises with months of accumulated curves, then plateaus — one year
    buys most of the available signal; the cap is one-sample-per-peak, not data."""
    months = np.linspace(0, 12, 200)
    # saturating curve: fast early gains, diminishing returns toward a ceiling.
    auc = 0.5 + 0.34 * (1 - np.exp(-months / 3.0))
    band = 0.05 * np.exp(-months / 4.0) + 0.015

    fig, ax = plt.subplots(figsize=(7.2, 4.0), dpi=120)
    ax.plot(months, auc, color="#1f77b4", lw=2.4, label="Time-dependent AUC")
    ax.fill_between(months, auc - band, auc + band, color="#1f77b4", alpha=0.15)
    ax.axhline(0.5, color="#888", ls=":", lw=1.2, label="No-skill baseline (0.5)")
    ax.axvline(12, color="#2ca02c", ls="--", lw=1.4)
    ax.annotate("~1 year of\ncollection", xy=(12, 0.62), xytext=(9.0, 0.56),
                fontsize=9, color="#2ca02c", ha="center")
    ax.annotate("ceiling = one sample\nper annual peak", xy=(11.5, 0.83),
                xytext=(5.5, 0.86), fontsize=9, color="#555",
                arrowprops=dict(arrowstyle="->", color="#999", lw=1))
    ax.set_ylim(0.45, 0.92)
    _style(ax, "Expected model skill vs. months of collected history",
           "Months of availability history collected", "Discrimination (AUC)")
    ax.legend(loc="lower right", fontsize=9, frameon=False)
    fig.text(0.5, 0.005, ILLUSTRATIVE, ha="center", fontsize=8, color="#999",
             style="italic")
    fig.tight_layout(rect=(0, 0.03, 1, 1))
    fig.savefig(OUT / "accuracy_vs_history.png")
    plt.close(fig)


def accuracy_vs_leadtime():
    """Accuracy by lead time, daily-only vs watch-informed. Both strong far out;
    daily cadence collapses in the flash window near release, where watch/ holds."""
    lead = np.linspace(0, 60, 200)  # days before the booking-window release moment
    # near lead=0 (release / flash window) daily sampling is blind; far out, easy.
    daily = 0.55 + 0.33 * (1 - np.exp(-lead / 9.0))
    watch = 0.78 + 0.16 * (1 - np.exp(-lead / 9.0))

    fig, ax = plt.subplots(figsize=(7.2, 4.0), dpi=120)
    ax.plot(lead, daily, color="#d62728", lw=2.4, label="Daily sweep only")
    ax.plot(lead, watch, color="#9467bd", lw=2.4, label="Watch-informed (dense)")
    ax.axvspan(0, 7, color="#d62728", alpha=0.07)
    ax.annotate("flash window\n(daily cadence blind)", xy=(3.5, 0.58),
                xytext=(14, 0.60), fontsize=9, color="#d62728",
                arrowprops=dict(arrowstyle="->", color="#d62728", lw=1))
    ax.set_ylim(0.5, 1.0)
    _style(ax, "Expected accuracy vs. lead time to sell-out",
           "Days before the booking window opens (lead time)",
           "Calibrated accuracy")
    ax.legend(loc="lower right", fontsize=9, frameon=False)
    fig.text(0.5, 0.005, ILLUSTRATIVE, ha="center", fontsize=8, color="#999",
             style="italic")
    fig.tight_layout(rect=(0, 0.03, 1, 1))
    fig.savefig(OUT / "accuracy_vs_leadtime.png")
    plt.close(fig)


if __name__ == "__main__":
    accuracy_vs_history()
    accuracy_vs_leadtime()
    print(f"wrote figures to {OUT}")
