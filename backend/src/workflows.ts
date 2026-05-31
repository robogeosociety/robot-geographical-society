/**
 * Cloudflare Workflows prototype for campsite availability — durable execution
 * alongside the existing Queue collector (does not replace it).
 *
 *  1. CampsiteCollectorWorkflow — durable daily snapshot. One step.do per site
 *     (per-step retry + resume-after-eviction), plain fetch → R2, same R2 layout
 *     the Mac ingest already reads.
 *  2. HotDateWatchWorkflow — the projection feature. Watches one (campsite,
 *     target_date), writes a dense point each check, then step.sleep()s on an
 *     ADAPTIVE cadence (hourly when near/filling, daily when far) until the date
 *     sells out or passes. Emits the dense burn-down data uniform daily snapshots
 *     can't — far better sell-out projections for the dates you care about.
 */
import { WorkflowEntrypoint, WorkflowStep, WorkflowEvent } from "cloudflare:workers";
import index from "./campsites-index.json";
import { fetchAvailability, type Counts } from "./availability";

export interface WfEnv {
  RAW: R2Bucket;
}

type Site = { id: string; kind: "rec" | "wa"; ref: string | number; name: string; agency: string };

// --- 1. Durable daily snapshot ---------------------------------------------

export class CampsiteCollectorWorkflow extends WorkflowEntrypoint<WfEnv, { date: string; limit?: number }> {
  async run(event: WorkflowEvent<{ date: string; limit?: number }>, step: WorkflowStep) {
    const { date, limit } = event.payload;
    const sites = (limit ? (index as Site[]).slice(0, limit) : (index as Site[]));
    const results: { id: string; dates: number }[] = [];
    for (const site of sites) {
      const r = await step.do(
        `collect ${site.id}`,
        { retries: { limit: 4, delay: "10 seconds", backoff: "exponential" }, timeout: "2 minutes" },
        async () => {
          const a = await fetchAvailability(site.kind, site.ref);
          await this.env.RAW.put(`raw/${date}/${site.agency}/${site.id}.json`, JSON.stringify(a.raw));
          await this.env.RAW.put(
            `summary/${date}/${site.id}.json`,
            JSON.stringify({ id: site.id, name: site.name, agency: site.agency, kind: site.kind, by_date: a.by }),
          );
          return { id: site.id, dates: Object.keys(a.by).length };
        },
      );
      results.push(r);
    }
    return { date, collected: results.length, results };
  }
}

// --- 2. Adaptive hot-date watcher ------------------------------------------

type WatchParams = Site & { targetDate: string; every?: string; maxChecks?: number };

export class HotDateWatchWorkflow extends WorkflowEntrypoint<WfEnv, WatchParams> {
  async run(event: WorkflowEvent<WatchParams>, step: WorkflowStep) {
    const p = event.payload;
    const cap = p.maxChecks ?? 500;

    for (let checks = 0; checks < cap; checks++) {
      // All non-determinism (fetch, clock, R2 write) lives inside the step, so it
      // executes once and its result is persisted — safe across replays.
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
          const now = Date.now();
          const daysOut = (Date.parse(p.targetDate) - now) / 86_400_000;
          const fill = c.total ? 1 - c.available / c.total : 0;
          const done = c.available === 0 || daysOut <= 0;
          // Adaptive cadence — the whole point: dense data when it matters.
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
