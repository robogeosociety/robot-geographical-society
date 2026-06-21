// Daily prediction-readiness Workflow. Scans the last ~60 collection dates of R2
// sites/ history, folds it into the readiness gauge, and writes one campsite_readiness
// Analytics Engine row. Replaces the host observability ingest.py:compute_readiness —
// the last piece of campsite monitoring to leave the Mac. Self-perpetuates daily via
// continue-as-new, like CollectorLoop (no cron); start once with POST /readiness/start.
import { WorkflowEntrypoint, WorkflowStep, WorkflowEvent } from "cloudflare:workers";
import type { WfEnv } from "./workflows";
import {
  type CampgroundFile,
  type Partial,
  emptyPartial,
  finalize,
  foldCampground,
  mergePartials,
} from "./readiness";

const MAX_DAYS = 60; // recent-history horizon (also bounds R2 reads as history grows)
const CGS_PER_STEP = 8; // campgrounds folded per checkpointed step (≈ CGS_PER_STEP×60 R2 GETs)
const DAY_MS = 86_400_000;

export class ReadinessWorkflow extends WorkflowEntrypoint<WfEnv, Record<string, never>> {
  async run(_event: WorkflowEvent<Record<string, never>>, step: WorkflowStep) {
    // 1. List sites/ once, group keys by campground id, keep the last MAX_DAYS dates.
    const { dates, byCg } = await step.do("list", async () => {
      const keys: string[] = [];
      let cursor: string | undefined;
      do {
        const res = await this.env.RAW.list({ prefix: "sites/", cursor, limit: 1000 });
        for (const o of res.objects) keys.push(o.key);
        cursor = res.truncated ? res.cursor : undefined;
      } while (cursor);

      const dateset = new Set<string>();
      for (const k of keys) {
        const parts = k.split("/"); // sites/<date>/<id>.json
        if (parts.length >= 3 && parts[0] === "sites" && parts[2].endsWith(".json")) dateset.add(parts[1]);
      }
      const dates = [...dateset].sort().slice(-MAX_DAYS);
      const keep = new Set(dates);
      const byCg: Record<string, string[]> = {};
      for (const k of keys) {
        const parts = k.split("/");
        if (parts.length >= 3 && parts[0] === "sites" && keep.has(parts[1]) && parts[2].endsWith(".json")) {
          const id = parts[2].slice(0, -".json".length);
          (byCg[id] ??= []).push(k);
        }
      }
      return { dates, byCg };
    });

    // 2. Fold campground-by-campground (batched per step) into a running Partial.
    //    Peak memory = one campground's cells; the accumulator is scalars + a histogram.
    const cgIds = Object.keys(byCg);
    let acc = emptyPartial();
    for (let i = 0; i < cgIds.length; i += CGS_PER_STEP) {
      const batch = cgIds.slice(i, i + CGS_PER_STEP);
      const part: Partial = await step.do(`fold-${i}`, async () => {
        let p = emptyPartial();
        for (const id of batch) {
          const files: CampgroundFile[] = [];
          for (const key of byCg[id]) {
            const obj = await this.env.RAW.get(key);
            if (obj) files.push(JSON.parse(await obj.text()) as CampgroundFile);
          }
          p = mergePartials(p, foldCampground(files));
        }
        return p;
      });
      acc = mergePartials(acc, part);
    }

    // 3. Compute + write the singleton campsite_readiness row.
    await step.do("write", async () => {
      const row = finalize(acc, dates);
      this.env.READINESS_AE?.writeDataPoint({
        indexes: ["readiness"],
        blobs: [row.band],
        doubles: [
          row.readiness,
          row.event_score,
          row.coverage,
          row.depth_score,
          row.events,
          row.active_cells,
          row.cells,
          row.median_depth,
          row.history_months,
          row.expected_accuracy,
          row.campgrounds,
          row.collect_days,
          row.ready_eta_days,
        ],
      });
      return row;
    });

    // 4. Daily loop via continue-as-new (matches CollectorLoop; survives crashes when
    //    re-kicked by POST /readiness/start).
    await step.sleep("wait", DAY_MS);
    await step.do("continue-as-new", async () => {
      await this.env.READINESS_WF.create({ params: {} });
      return { ok: true };
    });
  }
}
