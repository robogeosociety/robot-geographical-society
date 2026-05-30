/**
 * Campsite availability collector — Browser Rendering (Playwright) + Queues.
 *
 * Producer (cron): enqueue one message per reservable campsite.
 * Consumer (queue): drain a batch, launch ONE browser, fetch each campsite's
 * availability via same-origin fetch inside the page (real browser fingerprint
 * + cookies clear the WAF), summarize per target_date, write raw + summary to R2.
 *
 * Ported from data/campsite_sync/{rec_gov,wa_state_parks}.py.
 */
import { launch } from "@cloudflare/playwright";
import index from "./campsites-index.json";

export interface Env {
  BROWSER: Fetcher;
  RAW: R2Bucket;
  CAMPSITE_QUEUE: Queue<Job>;
}

export interface Job {
  id: string;
  kind: "rec" | "wa";
  ref: string | number;
  name: string;
  agency: string;
  date: string; // YYYY-MM-DD snapshot date (shared per run)
}

const MONTHS = 6;

const utcDate = (d: Date) => d.toISOString().slice(0, 10);

/** First-of-month timestamps for the next `n` months from `start`. */
function monthStarts(start: Date, n: number): { y: number; m: number }[] {
  const out: { y: number; m: number }[] = [];
  for (let i = 0; i < n; i++) {
    const d = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + i, 1));
    out.push({ y: d.getUTCFullYear(), m: d.getUTCMonth() + 1 });
  }
  return out;
}

type Counts = { available: number; reserved: number; total: number };
type ByDate = Record<string, Counts>;

// --- Producer ---------------------------------------------------------------

export async function runProducer(env: Env, limit?: number): Promise<number> {
  const date = utcDate(new Date());
  let jobs: Job[] = (index as Omit<Job, "date">[]).map((c) => ({ ...c, date }));
  if (limit && limit > 0) jobs = jobs.slice(0, limit); // smoke-test a few sites
  // sendBatch caps at 100 messages; we have ~61.
  for (let i = 0; i < jobs.length; i += 100) {
    await env.CAMPSITE_QUEUE.sendBatch(jobs.slice(i, i + 100).map((body) => ({ body })));
  }
  return jobs.length;
}

// --- Fetch + summarize (inside the browser page) ----------------------------

/** Run a same-origin JSON GET from inside the page (browser cookies + WAF). */
async function pageJson(page: any, url: string): Promise<any> {
  return page.evaluate(async (u: string) => {
    const r = await fetch(u, { headers: { Accept: "application/json, text/plain, */*" } });
    if (!r.ok) throw new Error(`HTTP ${r.status} for ${u}`);
    return r.json();
  }, url);
}

async function fetchRec(page: any, id: string, start: Date) {
  const raw: Record<string, any> = {};
  const by: ByDate = {};
  for (const { y, m } of monthStarts(start, MONTHS)) {
    const sd = `${y}-${String(m).padStart(2, "0")}-01T00:00:00.000Z`;
    const url = `https://www.recreation.gov/api/camps/availability/campground/${id}/month?start_date=${encodeURIComponent(sd)}`;
    const data = await pageJson(page, url);
    raw[`${y}-${String(m).padStart(2, "0")}`] = data;
    for (const site of Object.values<any>(data.campsites ?? {})) {
      for (const [ds, status] of Object.entries<string>(site.availabilities ?? {})) {
        const day = ds.slice(0, 10);
        const c = (by[day] ??= { available: 0, reserved: 0, total: 0 });
        const s = String(status).toLowerCase();
        if (s === "available") c.available++;
        else if (s === "reserved") c.reserved++;
        c.total++;
      }
    }
  }
  return { raw, by };
}

const WA_AVAIL: Record<number, "available" | "reserved" | "other"> = {
  0: "available", 5: "available", 1: "reserved", 2: "other", 3: "other", 4: "other",
};

async function fetchWa(page: any, ref: number | string, start: Date) {
  const base = "https://washington.goingtocamp.com";
  const maps: any[] = await pageJson(page, `${base}/api/maps?resourceLocationId=${ref}&bookingCategoryId=0`);
  const mapIds = (Array.isArray(maps) ? maps : []).map((m) => m.mapId).filter(Boolean);
  const raw: Record<string, any> = {};
  const by: ByDate = {};
  for (const { y, m } of monthStarts(start, MONTHS)) {
    const startISO = `${y}-${String(m).padStart(2, "0")}-01`;
    const end = m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, "0")}-01`;
    const monthKey = `${startISO}`;
    const c: Counts = { available: 0, reserved: 0, total: 0 };
    const seen = new Set<string>();
    for (const mapId of mapIds) {
      try {
        const url = `${base}/api/availability/map?mapId=${mapId}&startDate=${startISO}&endDate=${end}&bookingCategoryId=0&nights=1`;
        const data = await pageJson(page, url);
        raw[`${monthKey}:${mapId}`] = data;
        for (const [rid, avails] of Object.entries<any>(data.resourceAvailabilities ?? {})) {
          if (seen.has(rid) || !avails?.length) continue;
          seen.add(rid);
          const label = WA_AVAIL[avails[0].availability] ?? "other";
          if (label === "available") c.available++;
          else if (label === "reserved") c.reserved++;
          c.total++;
        }
      } catch {
        /* some sub-maps 403 — expected, skip */
      }
    }
    by[monthKey] = c;
  }
  return { raw, by };
}

// --- Consumer ---------------------------------------------------------------

export async function processBatch(batch: MessageBatch<Job>, env: Env): Promise<void> {
  const start = new Date();
  const browser = await launch(env.BROWSER);
  const page = await browser.newPage();
  let onRec = false, onWa = false;
  try {
    for (const msg of batch.messages) {
      const job = msg.body;
      try {
        let result: { raw: Record<string, any>; by: ByDate };
        if (job.kind === "rec") {
          if (!onRec) { await page.goto("https://www.recreation.gov/", { waitUntil: "domcontentloaded" }); onRec = true; onWa = false; }
          result = await fetchRec(page, String(job.ref), start);
        } else {
          if (!onWa) {
            await page.goto("https://washington.goingtocamp.com/", { waitUntil: "networkidle" });
            try { await page.getByText("I Consent").click({ timeout: 2500 }); } catch { /* no banner */ }
            onWa = true; onRec = false;
          }
          result = await fetchWa(page, job.ref, start);
        }
        await env.RAW.put(`raw/${job.date}/${job.agency}/${job.id}.json`, JSON.stringify(result.raw));
        await env.RAW.put(
          `summary/${job.date}/${job.id}.json`,
          JSON.stringify({ id: job.id, name: job.name, agency: job.agency, kind: job.kind, by_date: result.by }),
        );
        msg.ack();
      } catch (err) {
        console.error(`collect failed for ${job.name} (${job.id}):`, err);
        msg.retry();
      }
    }
  } finally {
    await browser.close();
  }
}
