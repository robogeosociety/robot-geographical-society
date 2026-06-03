/**
 * Cloudflare Workflows collector — deadline-driven durable execution.
 *
 *  1. CollectorLoop — a single self-scheduling durable loop. Each wake it collects
 *     only the sites whose freshness deadline has arrived (distributed skipping),
 *     reschedules them now+X, writes a heartbeat, then step.sleep()s until the next
 *     earliest deadline. Guarantees every site is refreshed within X days (X =
 *     MAX_STALENESS_DAYS) with no fixed schedule. Periodically continue-as-new to
 *     keep step history bounded. State rides in the payload; the heartbeat in R2 is
 *     the recovery snapshot. See SCHEDULER-PLAN.md.
 *  2. HotDateWatchWorkflow — adaptive dense watcher for one (campsite, target_date).
 */
import { WorkflowEntrypoint, WorkflowStep, WorkflowEvent } from "cloudflare:workers";
import index from "./campsites-index.json";
import { fetchAvailability, type Counts } from "./availability";
import { type DueMap, type FailMap, seedDue, mergeDue, selectDue, nextSleepMs, jitterMs, retryBackoffMs } from "./scheduler";

export interface WfEnv {
  RAW: R2Bucket;
  COLLECTOR_WF: Workflow; // self-reference for continue-as-new
  MAX_STALENESS_DAYS?: string;
  INACTIVE_AFTER_FAILURES?: string; // consecutive failures before a site is quarantined
  COLLECTOR_AE?: AnalyticsEngineDataset; // per-site coverage → Grafana
  RUNS_AE?: AnalyticsEngineDataset; // (kept for compatibility)
  AVAIL_AE?: AnalyticsEngineDataset; // per-site availability rollup
  WATCH_AE?: AnalyticsEngineDataset; // dense per-check watch points
}

type Site = { id: string; kind: "rec" | "wa"; ref: string | number; name: string; agency: string };

export const HEARTBEAT_KEY = "scheduler/heartbeat.json";
export const DLQ_PREFIX = "dlq/"; // dlq/<siteId>.json — presence == site is quarantined

// Loop tuning.
const SLACK_MS = 30_000; // collect anything due within 30s of a wake
// Collect one site per wake — maximally distributed. In steady state only ~1
// site is ever due per wake anyway; this also drips the cold-start prime and any
// post-downtime pile-up out one-at-a-time (paced by MIN_SLEEP) instead of in a
// burst. A full 140-site catch-up still clears in ~35min, far inside the SLA.
const MAX_BATCH = 1;
const MIN_SLEEP_MS = 15_000; // never busy-loop
const MAX_SLEEP_MS = 6 * 60 * 60_000; // wake at least every 6h (heartbeat liveness)
// Failed sites back off exponentially: 10m, 20m, 40m … capped. A transient outage
// that recovers within the hour is retried progressively later instead of on a
// fixed cadence, so one broken site can't dominate the collection-attempt rate.
const RETRY_BASE_MS = 10 * 60_000;
const RETRY_CAP_MS = 6 * 60 * 60_000;
const INACTIVE_AFTER_DEFAULT = 5; // consecutive failures → quarantine to the DLQ
const PROBE_INTERVAL_MS = 24 * 60 * 60_000; // re-test a quarantined site ~once/day
const ITER_BUDGET = 50; // wakes per instance before continue-as-new
const PRIME = 8; // cold-start: collect this many immediately for a prompt baseline

export type DlqEntry = {
  id: string;
  name: string;
  agency: string;
  kind: string;
  since: number;
  sinceISO: string;
  failures: number;
  lastError: string;
};

const dlqKey = (id: string) => `${DLQ_PREFIX}${id}.json`;

/** The set of quarantined site ids — R2 is the source of truth (inspectable, durable). */
export async function listDlqIds(env: WfEnv): Promise<Set<string>> {
  const ids = new Set<string>();
  let cursor: string | undefined;
  do {
    const r: R2Objects = await env.RAW.list({ prefix: DLQ_PREFIX, cursor });
    for (const o of r.objects) {
      const id = o.key.slice(DLQ_PREFIX.length).replace(/\.json$/, "");
      if (id) ids.add(id);
    }
    cursor = r.truncated ? r.cursor : undefined;
  } while (cursor);
  return ids;
}

// --- shared per-site collection (used by the loop and the ad-hoc endpoint) -----

export async function collectSite(env: WfEnv, site: Site, date: string) {
  const t0 = Date.now();
  const a = await fetchAvailability(site.kind, site.ref);
  await env.RAW.put(`raw/${date}/${site.agency}/${site.id}.json`, JSON.stringify(a.raw));
  await env.RAW.put(
    `summary/${date}/${site.id}.json`,
    JSON.stringify({ id: site.id, name: site.name, agency: site.agency, kind: site.kind, by_date: a.by }),
  );
  await env.RAW.put(
    `sites/${date}/${site.id}.json`,
    JSON.stringify({ id: site.id, name: site.name, agency: site.agency, kind: site.kind, collected_date: date, sites: a.bySite }),
  );
  env.COLLECTOR_AE?.writeDataPoint({
    indexes: [site.id],
    blobs: [date, site.agency, site.kind, site.name, "ok"],
    doubles: [Object.keys(a.by).length, Date.now() - t0],
  });
  let av = 0, rs = 0, tot = 0, open = 0;
  for (const c of Object.values(a.by)) {
    av += c.available;
    rs += c.reserved;
    tot += c.total;
    if (c.available > 0) open++;
  }
  env.AVAIL_AE?.writeDataPoint({
    indexes: [site.id],
    blobs: [date, site.agency, site.name],
    doubles: [av, rs, tot, open],
  });
  return { id: site.id, dates: Object.keys(a.by).length };
}

// siteId → next-probe epoch ms. Presence marks the loop's view that a site is
// quarantined; the authoritative set is the DLQ in R2 (the two are reconciled
// each wake, so deleting a dlq/<id>.json reactivates the site).
type ProbeMap = Record<string, number>;

async function bootstrap(
  env: WfEnv,
  sites: Site[],
  X: number,
  now: number,
): Promise<{ due: DueMap; fails: FailMap; probe: ProbeMap }> {
  const inactive = await listDlqIds(env);
  // Recovery: resume from the last heartbeat snapshot in R2 (seed any new sites).
  try {
    const hb = await env.RAW.get(HEARTBEAT_KEY);
    if (hb) {
      const j: any = await hb.json();
      if (j?.due && typeof j.due === "object") {
        const probe: ProbeMap = {};
        for (const id of inactive) probe[id] = j.probe?.[id] ?? now + PROBE_INTERVAL_MS;
        return { due: mergeDue(j.due, sites, X, now, inactive), fails: j.fails ?? {}, probe };
      }
    }
  } catch {
    /* fall through to a cold seed */
  }
  const probe: ProbeMap = {};
  for (const id of inactive) probe[id] = now + PROBE_INTERVAL_MS;
  return { due: seedDue(sites, X, now, PRIME, inactive), fails: {}, probe };
}

async function writeHeartbeat(
  env: WfEnv,
  nowMs: number,
  collectedTotal: number,
  due: DueMap,
  fails: FailMap,
  probe: ProbeMap,
) {
  await env.RAW.put(
    HEARTBEAT_KEY,
    JSON.stringify({
      lastWakeMs: nowMs,
      lastWakeISO: new Date(nowMs).toISOString(),
      collectedTotal,
      sites: Object.keys(due).length,
      inactive: Object.keys(probe).length,
      dueWithinHour: Object.values(due).filter((d) => d <= nowMs + 3_600_000).length,
      due,
      fails,
      probe,
    }),
  );
}

// --- 1. Deadline-driven durable loop -------------------------------------------

type LoopPayload = { due?: DueMap; collectedTotal?: number; fails?: FailMap; probe?: ProbeMap };

export class CollectorLoop extends WorkflowEntrypoint<WfEnv, LoopPayload> {
  async run(event: WorkflowEvent<LoopPayload>, step: WorkflowStep) {
    const sites = index as Site[];
    const X = (Number(this.env.MAX_STALENESS_DAYS ?? "2") || 2) * 86_400_000;
    const inactiveAfter = Math.max(1, Number(this.env.INACTIVE_AFTER_FAILURES ?? "") || INACTIVE_AFTER_DEFAULT);
    const ae = this.env.COLLECTOR_AE;
    const mark = (id: string, date: string, agency: string, kind: string, name: string, status: string, d1 = 0) =>
      ae?.writeDataPoint({ indexes: [id], blobs: [date, agency, kind, name, status], doubles: [d1, 0] });

    let { due, fails, probe } = event.payload?.due
      ? { due: event.payload.due, fails: event.payload.fails ?? {}, probe: event.payload.probe ?? {} }
      : await step.do("bootstrap", () => bootstrap(this.env, sites, X, Date.now()));
    let collectedTotal = event.payload?.collectedTotal ?? 0;

    for (let i = 0; i < ITER_BUDGET; i++) {
      // Decide the wake's work inside a step so `now`/selection/DLQ read are
      // checkpointed (replay-safe). The DLQ list is authoritative for quarantine.
      const plan = await step.do(`plan-${i}`, async () => {
        const now = Date.now();
        return { now, inactiveIds: [...(await listDlqIds(this.env))], dueIds: selectDue(due, sites, now, SLACK_MS, MAX_BATCH) };
      });
      const date = new Date(plan.now).toISOString().slice(0, 10);
      const inactiveSet = new Set(plan.inactiveIds);

      // Reconcile loop state with the DLQ: a site we'd quarantined that's no longer
      // in the DLQ was reactivated out-of-band (manual /collect/reactivate or a hand
      // delete) → re-arm it now. Conversely adopt any externally-added quarantine.
      for (const id of Object.keys(probe)) {
        if (!inactiveSet.has(id)) {
          const site = sites.find((s) => s.id === id);
          delete probe[id];
          fails[id] = 0;
          due[id] = plan.now; // collect promptly to confirm recovery
          if (site) await step.do(`reactivate-${i}-${id}`, async () => (mark(id, date, site.agency, site.kind, site.name, "reactivated"), { id }));
        }
      }
      for (const id of inactiveSet) {
        if (!(id in probe)) probe[id] = plan.now + PROBE_INTERVAL_MS;
        delete due[id];
      }

      // Normal due collections (exponential backoff on failure; quarantine at the cap).
      for (const id of plan.dueIds) {
        if (inactiveSet.has(id)) continue;
        const site = sites.find((s) => s.id === id)!;
        try {
          await step.do(
            `collect-${i}-${id}`,
            { retries: { limit: 3, delay: "10 seconds", backoff: "exponential" }, timeout: "2 minutes" },
            () => collectSite(this.env, site, date),
          );
          due[id] = plan.now + X + jitterMs(id);
          fails[id] = 0;
          collectedTotal++;
        } catch (err) {
          const n = (fails[id] ?? 0) + 1;
          fails[id] = n;
          const lastError = String((err as any)?.message ?? err);
          if (n >= inactiveAfter) {
            // Quarantine: stop collecting it, record to the DLQ, emit an "inactive"
            // state change. A daily probe (and manual reactivation) can revive it.
            await step.do(`inactive-${i}-${id}`, async () => {
              const entry: DlqEntry = {
                id, name: site.name, agency: site.agency, kind: site.kind,
                since: plan.now, sinceISO: new Date(plan.now).toISOString(), failures: n, lastError,
              };
              await this.env.RAW.put(dlqKey(id), JSON.stringify(entry));
              mark(id, date, site.agency, site.kind, site.name, "inactive", n);
              return entry;
            });
            delete due[id];
            delete fails[id];
            probe[id] = plan.now + PROBE_INTERVAL_MS;
          } else {
            await step.do(`fail-${i}-${id}`, async () => (mark(id, date, site.agency, site.kind, site.name, "failed"), { id, error: lastError, fails: n }));
            due[id] = plan.now + retryBackoffMs(n, RETRY_BASE_MS, RETRY_CAP_MS) + jitterMs(id);
          }
        }
      }

      // At most one quarantined site re-tested per wake (cheap liveness probe).
      const probeId = Object.keys(probe)
        .filter((id) => probe[id] <= plan.now && !plan.dueIds.includes(id))
        .sort((a, b) => probe[a] - probe[b])[0];
      if (probeId) {
        const site = sites.find((s) => s.id === probeId)!;
        try {
          await step.do(`probe-${i}-${probeId}`, { retries: { limit: 1, delay: "10 seconds", backoff: "constant" }, timeout: "2 minutes" }, () => collectSite(this.env, site, date));
          await step.do(`probe-ok-${i}-${probeId}`, async () => {
            await this.env.RAW.delete(dlqKey(probeId));
            mark(probeId, date, site.agency, site.kind, site.name, "reactivated");
            return { id: probeId };
          });
          delete probe[probeId];
          fails[probeId] = 0;
          due[probeId] = plan.now + X + jitterMs(probeId);
          collectedTotal++;
        } catch {
          await step.do(`probe-fail-${i}-${probeId}`, async () => (mark(probeId, date, site.agency, site.kind, site.name, "failed"), { id: probeId }));
          probe[probeId] = plan.now + PROBE_INTERVAL_MS;
        }
      }

      await step.do(`heartbeat-${i}`, () => writeHeartbeat(this.env, plan.now, collectedTotal, due, fails, probe));

      // Wake at the soonest of any due deadline or probe time (disjoint key sets).
      const sleepMs = await step.do(`next-${i}`, async () => nextSleepMs({ ...due, ...probe }, Date.now(), MIN_SLEEP_MS, MAX_SLEEP_MS));
      await step.sleep(`wait-${i}`, sleepMs);
    }

    // continue-as-new: hand the live state to a fresh instance, bounding history.
    await step.do("continue-as-new", async () => {
      await this.env.COLLECTOR_WF.create({ params: { due, collectedTotal, fails, probe } });
      return { handedOff: true };
    });
    return { handedOff: true, sites: Object.keys(due).length, inactive: Object.keys(probe).length, collectedTotal };
  }
}

// --- 2. Adaptive hot-date watcher ----------------------------------------------

type WatchParams = Site & { targetDate: string; every?: string; maxChecks?: number };

export class HotDateWatchWorkflow extends WorkflowEntrypoint<WfEnv, WatchParams> {
  async run(event: WorkflowEvent<WatchParams>, step: WorkflowStep) {
    const p = event.payload;
    const cap = p.maxChecks ?? 500;

    for (let checks = 0; checks < cap; checks++) {
      const res = await step.do(
        `check ${checks}`,
        { retries: { limit: 3, delay: "30 seconds", backoff: "exponential" }, timeout: "2 minutes" },
        async () => {
          // Fetch only the target date's month (daily granularity for both rec and
          // wa) instead of a full year — far fewer requests per check, and
          // a.by[targetDate] now resolves for WA too (was monthly-keyed before).
          const target = new Date(`${p.targetDate}T00:00:00Z`);
          const monthStart = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth(), 1));
          const a = await fetchAvailability(p.kind, p.ref, 1, monthStart);
          const c: Counts = a.by[p.targetDate] ?? { available: 0, reserved: 0, total: 0 };
          const observedAt = new Date().toISOString();
          await this.env.RAW.put(
            `watch/${p.targetDate}/${p.id}/${observedAt}.json`,
            JSON.stringify({ id: p.id, name: p.name, agency: p.agency, target_date: p.targetDate, observedAt, ...c }),
          );
          this.env.WATCH_AE?.writeDataPoint({
            indexes: [p.id],
            blobs: [p.targetDate, p.agency, p.name],
            doubles: [c.available, c.reserved, c.total],
          });
          const now = Date.now();
          const daysOut = (Date.parse(p.targetDate) - now) / 86_400_000;
          const fill = c.total ? 1 - c.available / c.total : 0;
          const done = c.available === 0 || daysOut <= 0;
          const interval =
            p.every ?? (daysOut < 7 || fill > 0.8 ? "1 hour" : daysOut < 30 ? "6 hours" : "24 hours");
          return { c, done, interval, daysOut: Math.round(daysOut), fill: Math.round(fill * 100) };
        },
      );

      if (res.done) return { soldOut: res.c.available === 0, checks: checks + 1, last: res.c };
      await step.sleep(`wait ${checks}`, res.interval as any);
    }
    return { stopped: "maxChecks", checks: cap };
  }
}
