# SCHEDULER-PLAN.md — Deadline-driven distributed collection

**Status:** Implemented (`backend/src/scheduler.ts`, `workflows.ts` `CollectorLoop`, `index.ts`, `wrangler.toml`).
**Replaces:** the fixed daily window sweep (`planSchedule` + `windowSec`/`limit`/`window=0`) in `backend/src/workflows.ts` / `src/schedule.ts`, and the `0 7 * * *` cron.
**Independent of:** PR #62 (WA daily granularity) — that changes *what* a collection fetches; this changes *when/which* sites are collected. They compose.

---

## 1. Why change it

The current collector is a **fixed daily sweep**: a cron fires at `0 7 * * *`, creates one `CampsiteCollectorWorkflow`, and `planSchedule` paces all N sites across a `windowSec` (86400) window, the workflow sleeping site-to-site for ~24h.

Problems:
- **Fixed schedule** — every site is tied to the once-a-day cadence whether it needs it or not.
- **Brittle flags** — `windowSec`, `limit`, `window=0` are coupled knobs; behavior differs between cron (86400) and ad-hoc (3600/0), and the pacing math (`windowSec / N`, jitter, slot shuffle) is intricate for what should be a simple guarantee.
- **Doesn't lean on Workflows' durability the way it should** — it's one monolithic 24h instance, rather than using `step.sleep`/`step.do` as a freshness engine.

What we actually want is a **single guarantee**: *every campsite is refreshed within X days* — X configurable — with the timing free to float otherwise.

## 2. The model — freshness deadlines + skipping

Track a per-site deadline `due[siteId] = lastCollected + X`. A **single durable Workflow** runs a self-scheduling loop:

```
loop:
  now        = Date.now()                         // inside a step → checkpointed
  dueBatch   = sites where due[site] <= now + SLACK   // everything else is SKIPPED this wake
  for site in dueBatch:                           // small batches (see §6)
    try   collect(site, now)  (own step.do)  → due[site] = now + X ± jitter
    catch                                     → due[site] = now + RETRY_BACKOFF
  heartbeat(now, instanceId)                      // cheap liveness marker (§5)
  nextWake = min(due)                             // soonest deadline across the fleet
  step.sleep(max(MIN_SLEEP, nextWake - now))      // durable, variable-length wait
  every K iterations: continue-as-new(due) and return   // bound step history (§4)
```

- **Skipping** = on each wake, all sites not yet due are skipped. The loop only ever does the minimum work to keep the SLA.
- **No cron drives collection.** The sleep duration is computed from the data each iteration, so the spacing between invocations floats.

## 3. Why this satisfies the requirements

| Requirement | Mechanism |
|---|---|
| **≤ X days stale, guaranteed** | The loop always sleeps until the *earliest* deadline and collects it then. A site is collected at or before `lastCollected + X`. Provable upper bound. |
| **No fixed schedule** | Wake intervals = gaps between successive deadlines → naturally variable; nothing cron-driven. |
| **Flexible time between invocations** | `step.sleep(nextWake - now)` recomputed every loop. |
| **Configurable** | One env var `MAX_STALENESS_DAYS` (default **2**). Extends to per-agency / per-site X by storing a per-site period instead of a global. |
| **Leans on Workflows durability** | `step.sleep` survives eviction & resumes; `step.do` per collection is checkpointed + retried — the resumable behavior you expected. |
| **No brittle flags** | `windowSec`/`limit`/`window=0` deleted. `planSchedule`'s fixed-window machinery is gone. |

**Default X = 2 days** → with 140 sites, deadlines spread over 2 days means an average gap of `172800 / 140 ≈ 20 min` between wakes, each collecting ~1 site. Smooth, tiny batches — no bursts, no `windowSec` needed.

## 4. State — Workflow payload + R2-derived recovery

`due[]` is the only state. Two paths:

- **Continuity (normal):** `due[]` rides in the Workflow payload. When the loop hits its iteration budget it **continues-as-new** — spawns a fresh instance with the current `due[]` and returns. This bounds each instance's step history (avoids unbounded-loop step limits) while preserving state with zero external store.
- **Recovery (supervisor restart):** if started with no payload, read the last **heartbeat snapshot** (`scheduler/heartbeat.json` in R2), which carries the full `due[]` map; resume from it (`mergeDue` seeds any newly-added sites). 
- **True cold start (no heartbeat):** **prime** the first `PRIME` (8) sites for immediate collection — a prompt baseline — and spread the remaining sites uniformly across `[now, now+X)`, interleaved by booking system. So a fresh deploy starts producing data in seconds without collecting all sites at once.

This is exactly *"Workflow payload + R2-derived"*: the loop owns the live state; the heartbeat (written every wake) is the durable R2 snapshot the supervisor recovers from. No new bucket, KV, or DO.

## 5. Liveness — alert, don't auto-restart

The loop self-perpetuates via continue-as-new, so the only failure mode is a hard crash (an uncaught error that skips continue-as-new). Rather than carry a cron+supervisor to auto-restart it, we **alert a human and let them restart**:

- Each loop iteration writes a **heartbeat** (`{ instanceId, lastWakeMs, collectedTotal, due }`) to `scheduler/heartbeat.json` in R2.
- **No cron.** Staleness is surfaced by **Grafana → Discord** alerting (separate observability repo): if the newest collection per site ages past the SLA (queried from the `campsite_collector` Analytics Engine dataset), it fires a Discord alert.
- A human restarts with `POST /collect/start?force=1` (the `force` bypass is needed because a stale heartbeat can still read "alive" when no instance is actually running).

This trades automatic recovery for a simpler system with no scheduling primitive at all — appropriate because continue-as-new makes crashes rare, and a stalled collector is a human-noticed event, not a silent one.

## 6. Batching, fairness, failure

- **One site per wake (`MAX_BATCH = 1`):** maximally distributed. In steady state only ~1 site is due per wake anyway, so this changes nothing there; it only affects transients — the cold-start prime and post-downtime pile-ups drip out one-at-a-time (paced by `MIN_SLEEP` ≈ 15s) instead of bursting. A full 140-site catch-up clears in ~35min, far inside the 2-day SLA, so there's no reason to collect more than one at once.
- **Booking-system fairness:** tiny mixed batches mean no per-host bursts inherently. Deadlines are seeded interleaved across systems, and `± jitter` on each reschedule prevents lockstep — so the distribution property `planSchedule` gave us falls out *without* a fixed window.
- **Failures:** a failed collection sets `due = now + RETRY_BACKOFF` (minutes), not `now + X`, so it's retried soon and never silently goes stale. `step.do` retries handle transient errors first; the deadline backoff is the outer safety net.

## 7. HTTP surface (replaces the flag-driven endpoints)

- `POST /collect/start` — start the loop (no-op if a fresh heartbeat shows one already alive).
- `GET /scheduler/status` — heartbeat summary: last wake, `collectedTotal`, site count, overdue count.
- `POST /collect/site?id=<siteId>` — ad-hoc one-shot collect of one site now (backfill/debug), independent of the loop schedule.
- `windowSec` / `limit` / `window` params and the old `/collect/run`: **removed**.
- `HotDateWatchWorkflow` and `/watch`: **unchanged** (orthogonal feature).
- *(Future: `/collect/refresh-all` to re-seed `due[]` spread across `[now, now+X)` — deferred to keep the singleton-loop semantics simple.)*

## 8. Observability / SLA monitoring

- Heartbeat key doubles as a liveness signal for the supervisor and a dashboard source.
- Keep the existing `campsite_collector` / `_runs` AE datasets (emitted per collection).
- Add a **staleness gauge**: `max(now - lastCollected)` across the fleet → Grafana alert if it approaches X. This turns the SLA into something monitorable, not just asserted.

## 9. Migration

1. Extract the per-site collect body (`fetchAvailability` → `raw/`+`summary/`+`sites/` puts + AE) from `CampsiteCollectorWorkflow` into a shared `collectSite(env, site, date)`.
2. New `CollectorLoop` Workflow implementing §2; `continue-as-new` via its own binding.
3. Delete `src/schedule.ts` (`planSchedule`) + its tests; the simple uniform seed replaces it.
4. `wrangler.toml`: drop `0 7 * * *`, add weekly `0 0 * * 1` supervisor; add `MAX_STALENESS_DAYS` var.
5. `index.ts`: swap `scheduled()` to the supervisor; replace `/collect/run` flag params with §7 endpoints.
6. One-time bootstrap: hit an endpoint (or the first supervisor tick) to start the loop.

## 10. Risks / open questions

- **Workflow lifetime / step limits** — bounded by continue-as-new (each instance does K iterations then hands off). Need to pick K so per-instance history stays comfortably small; confirm CF Workflows' max sleep (sleeps here ≤ X = 2 days, well within limits) and step caps.
- **Heartbeat granularity** — writing it every wake is cheap (~1 R2 PUT/20min); acceptable. Could batch if needed.
- **Refresh-all burst** — explicitly spread across `[now, now+X)`, not `now`, to avoid a thundering herd (called out in §7).
- **Per-site X** — global X first; per-agency/per-site override (hot parks fresher) is a clean follow-up once the global model is proven.
- **Clock determinism** — every `Date.now()` / jitter read happens inside a `step.do`, so it's checkpointed and replay-safe.
- **Singleton loop** — `/collect/start` and the supervisor both guard on heartbeat freshness before creating an instance, so we don't run two competing loops (each would continue-as-new and double the collection rate). The guard has a small race window; a Durable Object lock would make it airtight if it ever matters.

---

*Decisions baked in (from review): X default = **2 days**; state = **Workflow payload + R2-derived**; liveness = **weekly supervisor**. Awaiting approval before implementation.*
