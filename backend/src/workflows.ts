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
import { type DueMap, seedDue, mergeDue, selectDue, nextSleepMs, jitterMs } from "./scheduler";

export interface WfEnv {
  RAW: R2Bucket;
  COLLECTOR_WF: Workflow; // self-reference for continue-as-new
  MAX_STALENESS_DAYS?: string;
  COLLECTOR_AE?: AnalyticsEngineDataset; // per-site coverage → Grafana
  RUNS_AE?: AnalyticsEngineDataset; // (kept for compatibility)
  AVAIL_AE?: AnalyticsEngineDataset; // per-site availability rollup
  WATCH_AE?: AnalyticsEngineDataset; // dense per-check watch points
}

type Site = { id: string; kind: "rec" | "wa"; ref: string | number; name: string; agency: string };

export const HEARTBEAT_KEY = "scheduler/heartbeat.json";

// Loop tuning.
const SLACK_MS = 30_000; // collect anything due within 30s of a wake
const MAX_BATCH = 8; // cap collections per wake (guards deadline pile-ups)
const MIN_SLEEP_MS = 15_000; // never busy-loop
const MAX_SLEEP_MS = 6 * 60 * 60_000; // wake at least every 6h (heartbeat liveness)
const RETRY_BACKOFF_MS = 10 * 60_000; // failed site retried soon, not a full X later
const ITER_BUDGET = 50; // wakes per instance before continue-as-new
const PRIME = 8; // cold-start: collect this many immediately for a prompt baseline

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

async function bootstrapDue(env: WfEnv, sites: Site[], X: number, now: number): Promise<DueMap> {
  // Recovery: resume from the last heartbeat snapshot in R2 (seed any new sites).
  try {
    const hb = await env.RAW.get(HEARTBEAT_KEY);
    if (hb) {
      const j: any = await hb.json();
      if (j?.due && typeof j.due === "object") return mergeDue(j.due, sites, X, now);
    }
  } catch {
    /* fall through to a cold seed */
  }
  return seedDue(sites, X, now, PRIME);
}

async function writeHeartbeat(env: WfEnv, nowMs: number, collectedTotal: number, due: DueMap) {
  await env.RAW.put(
    HEARTBEAT_KEY,
    JSON.stringify({
      lastWakeMs: nowMs,
      lastWakeISO: new Date(nowMs).toISOString(),
      collectedTotal,
      sites: Object.keys(due).length,
      dueWithinHour: Object.values(due).filter((d) => d <= nowMs + 3_600_000).length,
      due,
    }),
  );
}

// --- 1. Deadline-driven durable loop -------------------------------------------

type LoopPayload = { due?: DueMap; collectedTotal?: number };

export class CollectorLoop extends WorkflowEntrypoint<WfEnv, LoopPayload> {
  async run(event: WorkflowEvent<LoopPayload>, step: WorkflowStep) {
    const sites = index as Site[];
    const X = (Number(this.env.MAX_STALENESS_DAYS ?? "2") || 2) * 86_400_000;

    let due = event.payload?.due;
    if (!due) due = await step.do("bootstrap", () => bootstrapDue(this.env, sites, X, Date.now()));
    let collectedTotal = event.payload?.collectedTotal ?? 0;

    for (let i = 0; i < ITER_BUDGET; i++) {
      // Decide the due batch inside a step so `now`/selection are checkpointed.
      const plan = await step.do(`plan-${i}`, async () => {
        const now = Date.now();
        return { now, dueIds: selectDue(due!, sites, now, SLACK_MS, MAX_BATCH) };
      });

      const date = new Date(plan.now).toISOString().slice(0, 10);
      for (const id of plan.dueIds) {
        const site = sites.find((s) => s.id === id)!;
        try {
          await step.do(
            `collect-${i}-${id}`,
            { retries: { limit: 3, delay: "10 seconds", backoff: "exponential" }, timeout: "2 minutes" },
            () => collectSite(this.env, site, date),
          );
          due[id] = plan.now + X + jitterMs(id);
          collectedTotal++;
        } catch (err) {
          await step.do(`fail-${i}-${id}`, async () => {
            this.env.COLLECTOR_AE?.writeDataPoint({
              indexes: [site.id],
              blobs: [date, site.agency, site.kind, site.name, "failed"],
              doubles: [0, 0],
            });
            return { id, error: String((err as any)?.message ?? err) };
          });
          due[id] = plan.now + RETRY_BACKOFF_MS; // retry soon, don't go a full X stale
        }
      }

      await step.do(`heartbeat-${i}`, () => writeHeartbeat(this.env, plan.now, collectedTotal, due!));

      const sleepMs = await step.do(`next-${i}`, async () =>
        nextSleepMs(due!, Date.now(), MIN_SLEEP_MS, MAX_SLEEP_MS),
      );
      await step.sleep(`wait-${i}`, sleepMs);
    }

    // continue-as-new: hand the live state to a fresh instance, bounding history.
    await step.do("continue-as-new", async () => {
      await this.env.COLLECTOR_WF.create({ params: { due, collectedTotal } });
      return { handedOff: true };
    });
    return { handedOff: true, sites: Object.keys(due).length, collectedTotal };
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
          const a = await fetchAvailability(p.kind, p.ref, 12);
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
