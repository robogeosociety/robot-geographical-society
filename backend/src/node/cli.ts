/// <reference types="node" />
// Campsite collector + readiness scan as plain Node commands, run by
// .github/workflows/campsites.yml on the mini's runner. Replaces the CollectorLoop and
// ReadinessWorkflow Cloudflare Workflows (decommissioned 2026-10-28): each `collect`
// run is one wake of the old loop, with the heartbeat object carrying the scheduler
// state between runs instead of the Workflow payload.
//
//   node dist/cli.mjs collect      # collect what is due, probe one quarantined site
//   node dist/cli.mjs readiness    # daily prediction-readiness row
//
// Data lives under RGS_DATA (default /Volumes/dev/rgs): bucket/ is the old campsite-raw
// layout, datasets/ the old Analytics Engine datasets as JSONL.
import { existsSync } from "node:fs";
import { join } from "node:path";
import { FsBucket } from "./fs-bucket";
import { JsonlDataset } from "./jsonl-dataset";
import { collectSite, listDlqIds, HEARTBEAT_KEY, DLQ_PREFIX, type DlqEntry, type WfEnv } from "../workflows";
import { bundledInventory } from "../inventory";
import { seedDue, mergeDue, selectDue, jitterMs, retryBackoffMs, type DueMap, type FailMap } from "../scheduler";
import { notifyHotCampground } from "../discord";
import { type CampgroundFile, emptyPartial, finalize, foldCampground, mergePartials } from "../readiness";

const DATA = process.env.RGS_DATA ?? "/Volumes/dev/rgs";
const DAY_MS = 86_400_000;

// Same tuning as the Workflow loop (see workflows.ts), plus a per-run cap: the loop
// collected one site per wake every ~15 s at most; a run every 15 minutes takes up to
// MAX_PER_RUN, which clears a full 140-site catch-up in about six hours.
const SLACK_MS = 30_000;
const MAX_PER_RUN = Number(process.env.MAX_PER_RUN ?? "") || 6;
const RETRY_BASE_MS = 10 * 60_000;
const RETRY_CAP_MS = 6 * 60 * 60_000;
const INACTIVE_AFTER_DEFAULT = 5;
const PROBE_INTERVAL_MS = DAY_MS;
const PRIME = 8;
const READINESS_MAX_DAYS = 60;

type Site = Parameters<typeof collectSite>[1] & { collect?: boolean; reservation_url?: string | null };
type ProbeMap = Record<string, number>;

function env(): WfEnv {
  // A missing marker means the dev disk is not mounted (or the path moved): fail
  // closed rather than seeding a fresh scheduler state on the boot volume.
  if (!existsSync(join(DATA, ".rgs-data"))) {
    console.error(`${DATA}/.rgs-data missing — is /Volumes/dev mounted? Refusing to run.`);
    process.exit(1);
  }
  const datasets = join(DATA, "datasets");
  return {
    RAW: new FsBucket(join(DATA, "bucket")) as unknown as R2Bucket,
    COLLECTOR_AE: new JsonlDataset(datasets, "campsite_collector") as unknown as AnalyticsEngineDataset,
    AVAIL_AE: new JsonlDataset(datasets, "campsite_availability") as unknown as AnalyticsEngineDataset,
    READINESS_AE: new JsonlDataset(datasets, "campsite_readiness") as unknown as AnalyticsEngineDataset,
    DISCORD_WEBHOOK_URL: process.env.DISCORD_WEBHOOK_URL || undefined,
    HOT_FILL_THRESHOLD: process.env.HOT_FILL_THRESHOLD,
    MAX_STALENESS_DAYS: process.env.MAX_STALENESS_DAYS,
    INACTIVE_AFTER_FAILURES: process.env.INACTIVE_AFTER_FAILURES,
  } as unknown as WfEnv;
}

// The checked-out campsites-index.json is the inventory (the bot/inventory-sync PR
// updates it on main). The CAMPSITES KV copy it used to be pushed to is gone.
function loadSites(): Site[] {
  return (bundledInventory as unknown as Site[]).filter((s) => s.collect !== false);
}

// step.do's retry policy from the Workflow: 3 retries, exponential from 10 s, 2-minute cap per try.
async function withRetries<T>(fn: () => Promise<T>, retries = 3, delayMs = 10_000): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await Promise.race([
        fn(),
        new Promise<never>((_, rej) => setTimeout(() => rej(new Error("timed out after 2 minutes")), 120_000).unref()),
      ]);
    } catch (err) {
      if (attempt >= retries) throw err;
      await new Promise((r) => setTimeout(r, delayMs * 2 ** attempt));
    }
  }
}

function mark(e: WfEnv, site: Site, date: string, status: string, d1 = 0) {
  e.COLLECTOR_AE?.writeDataPoint({ indexes: [site.id], blobs: [date, site.agency, site.kind, site.name, status], doubles: [d1, 0] });
}

async function collect() {
  const e = env();
  const sites = loadSites();
  const byId = new Map(sites.map((s) => [s.id, s]));
  const X = (Number(e.MAX_STALENESS_DAYS ?? "2") || 2) * DAY_MS;
  const inactiveAfter = Math.max(1, Number(e.INACTIVE_AFTER_FAILURES ?? "") || INACTIVE_AFTER_DEFAULT);
  const now = Date.now();
  const date = new Date(now).toISOString().slice(0, 10);
  const inactive = await listDlqIds(e);

  // Bootstrap from the heartbeat snapshot (the loop's recovery path), seeding new sites.
  let due: DueMap;
  let fails: FailMap = {};
  let probe: ProbeMap = {};
  let collectedTotal = 0;
  const hb = await e.RAW.get(HEARTBEAT_KEY);
  const j: any = hb ? await hb.json() : null;
  if (j?.due && typeof j.due === "object") {
    due = mergeDue(j.due, sites, X, now, inactive);
    fails = j.fails ?? {};
    probe = j.probe ?? {};
    collectedTotal = j.collectedTotal ?? 0;
  } else {
    due = seedDue(sites, X, now, PRIME, inactive);
  }

  // Reconcile with the DLQ, which is authoritative: deleting dlq/<id>.json reactivates.
  for (const id of Object.keys(probe)) {
    if (!inactive.has(id)) {
      delete probe[id];
      fails[id] = 0;
      due[id] = now;
      const s = byId.get(id);
      if (s) mark(e, s, date, "reactivated");
    }
  }
  for (const id of inactive) {
    if (!(id in probe)) probe[id] = now + PROBE_INTERVAL_MS;
    delete due[id];
  }

  const dueIds = selectDue(due, sites, now, SLACK_MS, MAX_PER_RUN);
  for (const id of dueIds) {
    const site = byId.get(id)!;
    try {
      await withRetries(() => collectSite(e, site, date));
      due[id] = now + X + jitterMs(id);
      fails[id] = 0;
      collectedTotal++;
      console.log(`collected ${id}`);
      if (e.DISCORD_WEBHOOK_URL) {
        await notifyHotCampground(
          { RAW: e.RAW, CAMPSITES: undefined as unknown as KVNamespace, DISCORD_WEBHOOK_URL: e.DISCORD_WEBHOOK_URL, HOT_FILL_THRESHOLD: e.HOT_FILL_THRESHOLD },
          { id: site.id, name: site.name, agency: site.agency, kind: site.kind, ref: site.ref, lat: site.lat ?? null, lng: site.lng ?? null, reservation_url: site.reservation_url ?? null },
          date,
        );
      }
    } catch (err) {
      const n = (fails[id] ?? 0) + 1;
      const lastError = String((err as any)?.message ?? err);
      console.log(`failed ${id} (${n}): ${lastError}`);
      if (n >= inactiveAfter) {
        const entry: DlqEntry = { id, name: site.name, agency: site.agency, kind: site.kind, since: now, sinceISO: new Date(now).toISOString(), failures: n, lastError };
        await e.RAW.put(`${DLQ_PREFIX}${id}.json`, JSON.stringify(entry));
        mark(e, site, date, "inactive", n);
        delete due[id];
        delete fails[id];
        probe[id] = now + PROBE_INTERVAL_MS;
      } else {
        fails[id] = n;
        mark(e, site, date, "failed");
        due[id] = now + retryBackoffMs(n, RETRY_BASE_MS, RETRY_CAP_MS) + jitterMs(id);
      }
    }
  }

  // At most one quarantined site re-tested per run.
  const probeId = Object.keys(probe).filter((id) => probe[id] <= now && byId.has(id)).sort((a, b) => probe[a] - probe[b])[0];
  if (probeId) {
    const site = byId.get(probeId)!;
    try {
      await withRetries(() => collectSite(e, site, date), 1);
      await e.RAW.delete(`${DLQ_PREFIX}${probeId}.json`);
      mark(e, site, date, "reactivated");
      delete probe[probeId];
      fails[probeId] = 0;
      due[probeId] = now + X + jitterMs(probeId);
      collectedTotal++;
      console.log(`probe ${probeId}: reactivated`);
    } catch {
      mark(e, site, date, "failed");
      probe[probeId] = now + PROBE_INTERVAL_MS;
      console.log(`probe ${probeId}: still failing`);
    }
  }

  await e.RAW.put(
    HEARTBEAT_KEY,
    JSON.stringify({
      lastWakeMs: now,
      lastWakeISO: new Date(now).toISOString(),
      collectedTotal,
      sites: Object.keys(due).length,
      inactive: Object.keys(probe).length,
      dueWithinHour: Object.values(due).filter((d) => d <= now + 3_600_000).length,
      due,
      fails,
      probe,
    }),
  );
  console.log(`due ${dueIds.length}, ${Object.keys(due).length} sites scheduled, ${Object.keys(probe).length} quarantined`);
}

async function readiness() {
  const e = env();
  const keys: string[] = [];
  let cursor: string | undefined;
  do {
    const res = await e.RAW.list({ prefix: "sites/", cursor, limit: 10_000 });
    for (const o of res.objects) keys.push(o.key);
    cursor = res.truncated ? res.cursor : undefined;
  } while (cursor);

  const dates = [...new Set(keys.map((k) => k.split("/")[1]))].sort().slice(-READINESS_MAX_DAYS);
  const keep = new Set(dates);
  const byCg: Record<string, string[]> = {};
  for (const k of keys) {
    const [, d, file] = k.split("/");
    if (keep.has(d) && file?.endsWith(".json")) (byCg[file.slice(0, -5)] ??= []).push(k);
  }

  // One campground at a time, as in the Workflow, to bound memory.
  let acc = emptyPartial();
  for (const id of Object.keys(byCg)) {
    const files: CampgroundFile[] = [];
    for (const key of byCg[id]) {
      const obj = await e.RAW.get(key);
      if (obj) files.push(JSON.parse(await obj.text()) as CampgroundFile);
    }
    acc = mergePartials(acc, foldCampground(files));
  }
  const row = finalize(acc, dates);
  e.READINESS_AE?.writeDataPoint({
    indexes: ["readiness"],
    blobs: [row.band],
    doubles: [
      row.readiness, row.event_score, row.coverage, row.depth_score, row.events, row.active_cells, row.cells,
      row.median_depth, row.history_months, row.expected_accuracy, row.campgrounds, row.collect_days, row.ready_eta_days,
    ],
  });
  console.log(`readiness ${row.readiness.toFixed(3)} (${row.band}) over ${dates.length} days, ${Object.keys(byCg).length} campgrounds`);
}

const cmd = process.argv[2];
const run = cmd === "collect" ? collect : cmd === "readiness" ? readiness : null;
if (!run) {
  console.error("usage: cli.mjs collect|readiness");
  process.exit(2);
}
run().catch((err) => {
  console.error(err);
  process.exit(1);
});
