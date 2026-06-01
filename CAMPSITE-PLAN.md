# CAMPSITE-PLAN.md — Per-Campsite Availability Collection

**Status:** Phase 1 (collect) implemented — see §8. Phases 2–3 pending.
**Goal:** Collect availability at the level of the *individual campsite* (e.g. loop A, site 12), not just the campground-wide aggregate, so we can eventually predict when a specific site/date sells out.
**Non-goal:** Changing the daily cadence. Daily sampling stays — this is purely about granularity, not frequency.

---

## 1. Why

Today the collector predicts (at best) *campground* sell-out. The `summary/<date>/<id>.json` snapshot stores `by_date[YYYY-MM-DD] = {available, reserved, total}` — counts rolled up across every site in a campground (`backend/src/workflows.ts:58`, `backend/src/availability.ts:43-47`). That tells us "3 of 15 sites are free on June 15," but not *which* sites, what type they are, or which specific site burned down first.

For per-site sell-out prediction we need a time series keyed on `(campground, campsite, target_date)`, not `(campground, target_date)`.

## 2. The key realization: we already fetch this data

We are not adding any new network calls or scraping. The per-site detail is **already in the responses we fetch and then discard**:

- **rec.gov** — `fetchRecAvailability` iterates `data.campsites` (keyed by `campsite_id`), and for each site walks `site.availabilities` (a `date → status` map) — `backend/src/availability.ts:40-48`. It immediately collapses every site into per-day counts. The per-site identity (`campsite_id`, the `site` label like `A012`, `loop`, `campsite_type`, `type_of_use`) is dropped on the floor.
- **WA goingtocamp** — `fetchWaAvailability` iterates `data.resourceAvailabilities` (keyed by resource id) — `backend/src/availability.ts:76-83` — and likewise collapses to counts. The `/api/maps` call already pulls the resource/site metadata we'd need for labels.

So this is a **summarization change, not a collection change.** We stop throwing the per-site rows away.

## 3. Proposed data model

A normalized, source-agnostic per-site shape (unifies rec.gov + WA into one schema downstream consumers can read without knowing the source):

```jsonc
// sites/<date>/<campground-id>.json   — one file per campground per day
{
  "id": "246855",                 // campground id (matches campsites-index.json)
  "name": "Colonial Creek North",
  "agency": "nps",
  "kind": "rec",
  "collected_date": "2026-06-01",
  "sites": {
    "<campsite_id>": {
      "label": "A012",            // human site number / loop label
      "loop": "Loop A",
      "type": "STANDARD NONELECTRIC",
      "use": "Overnight",
      "by_date": {                // status per target night, source-normalized
        "2026-06-15": "available",
        "2026-06-16": "reserved"
      }
    }
    // … one entry per individual campsite
  }
}
```

Normalized status vocabulary: `available | reserved | other` (mirrors the existing rec/WA mapping in `availability.ts:45-46` and `WA_AVAIL` at `:54-56`). Anything not clearly available/reserved → `other`, so closed/NYR/management-hold sites don't masquerade as bookable.

## 4. R2 storage layout

| Prefix | Status | Contents |
|---|---|---|
| `raw/<date>/<agency>/<id>.json` | **unchanged** | full upstream API payloads (already per-site, but in two different un-normalized schemas) |
| `summary/<date>/<id>.json` | **unchanged** | campground aggregate `{available, reserved, total}` — the Mac/InfluxDB ingest still reads this, so we keep it for backward compatibility |
| `sites/<date>/<id>.json` | **NEW** | normalized per-campsite breakdown (§3) |

Keeping `summary/` untouched means **zero downstream breakage** — the existing ingest keeps working while the new per-site layer is added alongside it. `sites/` is a clean normalization of data that's otherwise only available in the bulky, dual-schema `raw/` blobs.

## 5. Code changes

Small and contained — three files in `backend/`:

1. **`src/availability.ts`** — have `fetchRecAvailability` / `fetchWaAvailability` return a `bySite` map alongside the existing `by` (campground rollup). Build `bySite` from the same loop that currently builds `by`, so the aggregate stays a derived sum and the two can't drift. `fetchAvailability` passes it through.
2. **`src/workflows.ts`** — in the `collect <id>` step (`workflows.ts:49-86`), write the new `sites/<date>/<id>.json` from `bySite` after the existing `raw/` and `summary/` puts. Aggregate `summary/` write stays as-is.
3. **`src/availability.ts` types** — add `PerSite` / `BySite` types next to `Counts`/`ByDate` (`availability.ts:10-11`).

No changes to the cron, the Hono routes, or `wrangler.toml` bindings (R2 prefix reuse needs no new binding). The pacing logic is replaced by `planSchedule` — see §6b.

## 6. Analytics Engine / observability

Per-site-per-date is high cardinality: ~61 campgrounds × (tens–hundreds of sites) × ~180 nights ≈ millions of cells per day. **Do not** fan this into Analytics Engine as one row per site-night — keep the existing campground-level AE datasets (`campsite_availability`, etc.) unchanged for Grafana coverage dashboards.

Per-site detail lives in R2 (`sites/`). The Mac-side ingest decides how much of it to land in InfluxDB and at what cardinality (proposed: tag by `campground_id` + `campsite_id`, field `state` 0/1, scoped to a watchlist of target dates rather than all 180 nights — see Open Questions).

## 6b. Request distribution / schedule generation

As the fleet grows, the request pattern against each booking system must stay
unobtrusive — evenly spread, interleaved, and varying day to day. The original
plan paced sites in index order, which clustered all rec.gov requests into the
front of the window and all goingtocamp into the tail, in the same order every
run. `planSchedule` (`src/schedule.ts`) replaces that:

- **Per-system even spread.** Items are grouped by booking system (`site.kind`).
  Each group of N is laid over N equal slots of width `windowSec / N`; one
  request per slot → even coverage with no bursts. Each system keeps its own
  cadence regardless of the others' size.
- **Interleaved.** Groups are merged and sorted by time, so requests alternate
  across systems (rec → wa → rec …) instead of arriving in per-agency blocks.
- **No fixed daily pattern.** The item→slot assignment is reshuffled and the
  offset within each slot is jittered every run, so a given site is never
  collected at the same time two days running.
- **Scales & is generic.** Adding campsites just shrinks the slots; adding a new
  booking system gives it its own independent cadence — no code change. The
  function is pure (randomness injected) so it runs inside the replay-safe
  `plan-schedule` Workflow step and is unit-tested with a seeded PRNG.

## 7. Volume & cost

- **Reads:** unchanged — same fetches, same daily cadence.
- **R2 writes:** +1 object per campground per day (61 extra PUTs/day). Negligible.
- **R2 storage:** `sites/` objects are larger than `summary/` (per-site rows) but far smaller than `raw/`. Order of low single-digit MB/day across all campgrounds. Append-forever is fine for now; a retention policy is a separate follow-up (already a gap noted for `summary/`/`raw/`).

## 8. Rollout

1. **Phase 1 — collect (✅ done, this PR):** §5 implemented. Per-site files land in `sites/<date>/<id>.json` on the same daily run. No consumer yet — purely begin banking the data so history accrues from day one.
2. **Phase 2 — ingest:** extend the Mac ingest to read `sites/` into InfluxDB for a curated watchlist of `(campground, date)` pairs (the dates we actually want to forecast), keeping cardinality bounded.
3. **Phase 3 — model:** once a season of per-site history exists, build the per-site sell-out projection on top of it.

## 9. Open questions

- **WA site labels:** confirm the `/api/maps` response carries usable per-resource site numbers/loop names; if not, `sites/` carries the resource id and we enrich labels later.
- **Watchlist vs. firehose into InfluxDB:** land all site-nights, or only a curated set of target dates? (Leaning curated, to keep InfluxDB cardinality sane — full fidelity always remains in R2.)
- **`raw/` retention:** once `sites/` is the normalized source of truth, can `raw/` move to a shorter retention window to cap storage growth?

---

*This is a planning document. Implementation lands in a follow-up PR per the [ISSUES.md](./ISSUES.md) lifecycle (feature branch → local verify → PR → review).*
