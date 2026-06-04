# PREDICT.md — Per-site sell-out prediction

**Status:** Design sketch. No modeling code yet. Depends on `sites/` collection (CAMPSITE-PLAN.md §8, shipped) accumulating history.
**Goal:** For a specific site `S` and a specific stay-date `D`, produce a *calibrated probability* that `S` is still bookable on `D` as a function of time — and from it a median sell-out ETA with uncertainty.
**Non-goal:** A deterministic "it sells out at 09:04:12 on Tuesday" timestamp. Cadence and one-sample-per-peak (§2) make that unachievable; we predict a distribution, not an instant.

---

## 1. The problem is time-to-event, not regression

For a target stay-date `D` and site `S`, each collection day yields one observation of `by_date[D]` (`other → available → reserved`). The thing we want to predict — *when does it flip to `reserved`* — is a **survival / time-to-event** problem. The "subject" is a `(site, target_date)` pair; the "event" is the first `available → reserved` transition; observations are **right-censored** when `D` passes still-available, collection ends, or the site is quarantined to `dlq/`.

We model the **hazard**: given the site is still available at observation `t`, the probability it sells out before the next observation.

## 2. Why a year gives less than it sounds — and where the signal actually is

- **Per-cell sparsity.** Each `(site, target_date)` produces *one* burn-down curve per year. July-4-2026 at Bedal site 12 happens once. That cell alone can't yield a distribution.
- **Signal comes from pooling.** A year is thousands of curves (≈60 sites × hundreds of stay-dates) that share structure: day-of-week, holiday, season, site popularity, and **lead time since the booking window opened**. The model learns the *cohort* hazard and conditions down to the cell. This is the central design assumption.
- **One sample per annual peak.** With a single year you get the *shape* of demand by season/DOW/lead-time but only one observation of each specific peak, and no year-over-year trend term.

## 3. The clock that makes curves comparable: days-since-release

Do **not** use the calendar as the time axis. rec.gov is a rolling window (Bedal `booking_advance_days: 180`); WA differs. A date reads `other` until release, then the burn-down starts. Define:

```
release_date(D)        = D - booking_advance_days        # from campsites.json
days_since_release(t)  = collection_date(t) - release_date(D)   # hazard clock, t ≥ 0
lead_days(t)           = D - collection_date(t)          # days until the stay
```

`days_since_release` is the survival clock; `lead_days` is a feature. Aligning every curve to `t=0 = window opens` is what makes a summer Saturday at site A comparable to one at site B.

## 4. Unit of observation — the person-period (site-date-period) table

Discrete-time survival ⇒ **one row per `(site, target_date, observation_interval)` while the cell is at-risk** (still `available`). Snapshots are irregular (one site per wake, ≤2-day staleness), so each row carries its interval length as exposure.

```jsonc
// one row of the training table
{
  // ---- keys ----
  "campground_id": "233864",
  "site_id": "81008",
  "target_date": "2026-07-04",
  "obs_date": "2026-06-20",          // collection day of this interval's start
  "interval_days": 2,                // gap to next observation (exposure)

  // ---- survival clock ----
  "days_since_release": 16,          // §3 — hazard clock
  "lead_days": 14,                   // D - obs_date

  // ---- outcome ----
  "event": 1,                        // 1 = flipped available→reserved within this interval; else 0
  "censored": 0                      // 1 = run/stay ended or site→DLQ while still available
}
```

The model joins this skeleton to the feature blocks in §5.

## 5. Feature schema

Grouped by source. All derivable from data we already bank; no new collection.

| Group | Feature | Source | Notes |
|---|---|---|---|
| **Site identity** | `agency`, `kind` | `campsites.json` | rec vs WA hazard shapes differ |
| | `site_type`, `use`, `loop` | `sites/<date>/<id>.json` | WA `type`/`use` may be null (PR #69: `loop` now populated) |
| **Site attributes** | `campground_total_sites` | `campsites.json` | scarcity proxy |
| | `site_popularity` | derived | historical fill-fraction of this site across all past curves |
| | `lat`, `lng` | `campsites.json` | proximity-to-metro / corridor effects |
| **Calendar (of `D`)** | `dow`, `is_weekend` | `target_date` | dominant driver |
| | `is_holiday`, `days_to_nearest_holiday` | calendar table | US + WA holidays; long weekends |
| | `month`, `season`, `is_peak_season` | `target_date` | |
| **Survival clock** | `days_since_release`, `lead_days` | §3 | hazard clock + feature |
| | `release_window_days` | `booking_advance_days` | 180 / WA-specific |
| **State / dynamics** | `cg_fill_fraction[D]` | `sites/` (or `summary/`) | how full the *campground* is on `D` now |
| | `neighbor_fill_fraction[D]` | `sites/` | same loop / same type fill on `D` |
| | `burn_rate_k` | `sites/` history | Δ reserved over last *k* snapshots for this cell's cohort |
| | `days_available_so_far` | `sites/` history | how long this cell has survived since release |
| **Data quality** | `snapshot_staleness` | collection meta | hours since `obs_date`'s actual fetch |
| | `is_watched` | presence in `watch/` | dense vs daily — gates flash-date trust (§8) |

Targets/labels come from the §4 skeleton (`event`, `interval_days`, `censored`).

## 6. Baseline model — discrete-time hazard

**Model:** discrete-time hazard `h(t | x) = P(sell out in interval | survived to t, x)`, fit as **binary classification on the person-period table** — start with gradient-boosted trees (XGBoost/LightGBM); keep penalized logistic as the interpretable reference.

Why this over Cox PH:
- **Irregular, interval-censored** daily/2-day snapshots map cleanly to discrete intervals (include `log(interval_days)` as an offset/feature for exposure).
- **Time-varying covariates** (`cg_fill_fraction`, `burn_rate`) are native to person-period format.
- **Hazard spikes at release** violate Cox proportionality; trees capture the `release × DOW × popularity` interactions Cox can't.
- **Calibration** (the actual deliverable) is straightforward for a probabilistic classifier.

**EDA baseline first:** Kaplan–Meier survival curves by cohort (DOW × season × popularity tier) — both a sanity check (summer Saturdays must burn faster than November weeknights) and the naive benchmark the model must beat.

**Inference — from hazards to answers.** For a `(site, D)` predict the hazard at each future interval, then:
```
S(t) = Π_{u ≤ t} (1 − h(u))                 # survival curve = P(still available)
P(available at horizon L)  = S(L)
median sell-out ETA        = min t : S(t) ≤ 0.5
risk band                  = {t : S(t) ∈ [0.25, 0.75]}   # the uncertainty window
```
Output per cell: a survival curve + median ETA + risk band — *"~85% gone within 3 days of release, median 1 day."*

## 7. Evaluation

- **Discrimination:** time-dependent AUC / concordance (can we rank which cells sell out first at a given lead time?).
- **Calibration:** reliability curve + Brier score on `S(L)` — *the* metric, since the product is a probability.
- **Beats naive:** must outperform the KM cohort-median benchmark (§6).
- **Temporal validity / no leakage:** split by **target-date cohort**, never by row — a cell's *entire* curve lives in one fold, else the burn-down leaks across train/test. With one year, use blocked/prequential CV over target-date windows.
- **Slice reporting:** report metrics split by `is_watched`, agency, season, popularity tier — aggregate numbers hide the flash-date failure mode (§8).

## 8. Known limits (carried from the analysis)

- **Flash sell-outs vs cadence.** Daily/2-day sweep can only localize a flash sell-out to a 48h window — possibly missing a 60-second drain. Reliable flash-date prediction needs `watch/` dense sampling on those cells; `is_watched` gates how much we trust those predictions. Expanding `watch/` coverage is the highest-leverage data improvement.
- **Sell-out is not absorbing.** Cancellations flip `reserved → available`. Baseline models *first* sell-out only; re-release is a §-C5 recurrent-events extension (data already captures it).
- **No exogenous drivers / no year-over-year.** Weather, smoke, events, virality aren't in the data, and one year gives no trend term.
- **New / DLQ'd sites** have no history → fall back to cohort priors.

## 9. Where it lives

Modeling is **downstream of R2**, so it belongs with the ingest/analysis side (the `observability` repo owns R2 → InfluxDB → Grafana; see `backend/README.md` boundary), not in the collector Worker. Proposed home: `observability/campsites/predict/` (Python, reads `sites/` + `watch/` from R2 via S3). This repo owns only the design (this doc) and the upstream data contract.

---

## Checkpoints

Each is independently shippable and has an acceptance gate. Don't advance until the gate passes.

| # | Checkpoint | Deliverable | Acceptance gate |
|---|---|---|---|
| **C0** | **Data assembly** | Script that walks `sites/<date>/*` from R2 and emits the §4 person-period table (Parquet); joins `campsites.json` for `booking_advance_days`. | Table builds end-to-end; row count, event rate, and censoring breakdown reported and sane (events ≪ rows; censored cells = dates that never sold out). |
| **C1** | **EDA + KM baseline** | Kaplan–Meier survival curves by cohort (DOW × season × popularity tier), on the `days_since_release` clock. | Curves show expected ordering — summer weekends/holidays burn down faster than shoulder weeknights. This is the naive benchmark for C2. |
| **C2** | **Baseline hazard model** | Discrete-time GBT hazard (§6) + penalized-logistic reference, trained on the §5 features with cohort-blocked CV (§7). | Beats the C1 KM-median benchmark on time-dependent AUC **and** Brier; reliability curve within tolerance (calibrated). |
| **C3** | **Per-cell predictions** | Batch job writing `predict/<id>.json` (survival curve + median ETA + risk band per `(site, D)`); spot-check a few hot cells against reality. | Outputs produced for all active cells; manual spot-checks plausible (known flash dates show short ETAs, sleepy weeknights long). |
| **C4** | **Watch-informed flash model** | Incorporate `watch/` dense points; report metrics sliced by `is_watched`. | Measurable lift on watched (flash) cells vs daily-only — quantifies the §8 cadence limit and the value of expanding `watch/`. |
| **C5** | **(Stretch) Recurrence + pooling** | Recurrent-events extension for cancellation/re-release; hierarchical partial pooling for sparse/new sites; year-2 trend term once a second year exists. | Re-release predictions calibrated; new-site predictions fall back to cohort priors without blowing up. |

**Critical path:** C0 → C1 → C2 → C3. C4/C5 are enhancements; C4 should be prioritized if flash-date accuracy is the product goal, since C2/C3 on daily-only data will underperform exactly where users care most.
