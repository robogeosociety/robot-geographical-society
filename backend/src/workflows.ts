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
  COLLECTOR_AE?: AnalyticsEngineDataset; // per-run/site coverage → Grafana (observability)
  RUNS_AE?: AnalyticsEngineDataset; // one row per collector run (totals)
  AVAIL_AE?: AnalyticsEngineDataset; // per-site availability rollup
  WATCH_AE?: AnalyticsEngineDataset; // dense per-check watch points
}

type Site = { id: string; kind: "rec" | "wa"; ref: string | number; name: string; agency: string };

// --- 1. Durable daily snapshot ---------------------------------------------

export class CampsiteCollectorWorkflow extends WorkflowEntrypoint<WfEnv, { date: string; limit?: number; windowSec?: number }> {
  async run(event: WorkflowEvent<{ date: string; limit?: number; windowSec?: number }>, step: WorkflowStep) {
    const { date, limit, windowSec = 3600 } = event.payload;
    const sites = limit ? (index as Site[]).slice(0, limit) : (index as Site[]);

    // Pace the full refresh across ~windowSec with per-gap jitter (±50%), planned
    // once inside a step (Math.random → replay-safe). Spreads the daily run over
    // ~1 hour so it isn't a synchronized burst against the sources.
    const gaps = await step.do('plan-schedule', async () => {
      const base = sites.length > 1 ? windowSec / sites.length : 0;
      return sites.map(() => Math.max(0, Math.round(base * (0.5 + Math.random()))));
    });

    let ok = 0;
    let failed = 0;
    let empty = 0;
    for (let i = 0; i < sites.length; i++) {
      const site = sites[i];
      try {
        const r = await step.do(
          `collect ${site.id}`,
          { retries: { limit: 4, delay: "10 seconds", backoff: "exponential" }, timeout: "2 minutes" },
          async () => {
            const t0 = Date.now();
            const a = await fetchAvailability(site.kind, site.ref);
            await this.env.RAW.put(`raw/${date}/${site.agency}/${site.id}.json`, JSON.stringify(a.raw));
            await this.env.RAW.put(
              `summary/${date}/${site.id}.json`,
              JSON.stringify({ id: site.id, name: site.name, agency: site.agency, kind: site.kind, by_date: a.by }),
            );
            // Per-site coverage metric (AE is sampled / at-least-once — fine for metrics).
            this.env.COLLECTOR_AE?.writeDataPoint({
              indexes: [site.id],
              blobs: [date, site.agency, site.kind, site.name, "ok"],
              doubles: [Object.keys(a.by).length, Date.now() - t0],
            });
            // Per-site availability rollup over all target_dates.
            const counts = Object.values(a.by);
            let siteNightsAvailable = 0;
            let siteNightsReserved = 0;
            let siteNightsTotal = 0;
            let datesOpen = 0;
            for (const c of counts) {
              siteNightsAvailable += c.available;
              siteNightsReserved += c.reserved;
              siteNightsTotal += c.total;
              if (c.available > 0) datesOpen++;
            }
            this.env.AVAIL_AE?.writeDataPoint({
              indexes: [site.id],
              blobs: [date, site.agency, site.name],
              doubles: [siteNightsAvailable, siteNightsReserved, siteNightsTotal, datesOpen],
            });
            const dates = Object.keys(a.by).length;
            return { id: site.id, dates, empty: dates === 0 };
          },
        );
        ok++;
        if (r.empty) empty++;
      } catch (err) {
        // A single site exhausting its retries must NOT abort the whole run.
        // Record the failure (own step → cached, resume-safe) and continue.
        await step.do(`record-failure ${site.id}`, async () => {
          this.env.COLLECTOR_AE?.writeDataPoint({
            indexes: [site.id],
            blobs: [date, site.agency, site.kind, site.name, "failed"],
            doubles: [0, 0],
          });
          return { id: site.id, failed: true, error: String((err as any)?.message ?? err) };
        });
        failed++;
      }
      // Jittered tick between sites — spreads the run across the window.
      if (i < sites.length - 1 && gaps[i] > 0) {
        await step.sleep(`pace ${i}`, `${gaps[i]} seconds`);
      }
    }
    // One row per run (cached → resume-safe). AE is sampled/at-least-once — fine.
    await step.do('record-run', async () => {
      this.env.RUNS_AE?.writeDataPoint({
        indexes: [date],
        blobs: [date],
        doubles: [sites.length, ok, failed, empty],
      });
      return { date, total: sites.length, ok, failed, empty };
    });
    return { date, total: sites.length, ok, failed, empty, windowSec };
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
          // Dense per-check watch metric (AE is sampled / at-least-once — fine for metrics).
          this.env.WATCH_AE?.writeDataPoint({
            indexes: [p.id],
            blobs: [p.targetDate, p.agency, p.name],
            doubles: [c.available, c.reserved, c.total],
          });
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
