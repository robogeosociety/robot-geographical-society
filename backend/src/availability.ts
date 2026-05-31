/**
 * Plain-fetch availability clients (no browser) — confirmed working from Worker
 * IPs against both rec.gov and WA goingtocamp. Reused by the Workflows prototype
 * (and, eventually, a simplified queue consumer).
 */
const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";
const pad = (n: number) => String(n).padStart(2, "0");

export type Counts = { available: number; reserved: number; total: number };
export type ByDate = Record<string, Counts>;

function monthStarts(start: Date, n: number): { y: number; m: number }[] {
  const out: { y: number; m: number }[] = [];
  for (let i = 0; i < n; i++) {
    const d = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + i, 1));
    out.push({ y: d.getUTCFullYear(), m: d.getUTCMonth() + 1 });
  }
  return out;
}

async function getJson(url: string, referer: string): Promise<any> {
  const r = await fetch(url, {
    headers: { Accept: "application/json, text/plain, */*", "User-Agent": UA, Referer: referer },
  });
  if (!r.ok) throw new Error(`HTTP ${r.status} for ${url}`);
  return r.json();
}

export async function fetchRecAvailability(id: string, months = 6, start = new Date()) {
  const raw: Record<string, any> = {};
  const by: ByDate = {};
  for (const { y, m } of monthStarts(start, months)) {
    const sd = `${y}-${pad(m)}-01T00:00:00.000Z`;
    const data = await getJson(
      `https://www.recreation.gov/api/camps/availability/campground/${id}/month?start_date=${encodeURIComponent(sd)}`,
      `https://www.recreation.gov/camping/campgrounds/${id}`,
    );
    raw[`${y}-${pad(m)}`] = data;
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

export async function fetchWaAvailability(ref: number | string, months = 6, start = new Date()) {
  const base = "https://washington.goingtocamp.com";
  const maps = await getJson(`${base}/api/maps?resourceLocationId=${ref}&bookingCategoryId=0`, `${base}/`);
  const mapIds = (Array.isArray(maps) ? maps : []).map((m: any) => m.mapId).filter(Boolean);
  const raw: Record<string, any> = {};
  const by: ByDate = {};
  for (const { y, m } of monthStarts(start, months)) {
    const startISO = `${y}-${pad(m)}-01`;
    const end = m === 12 ? `${y + 1}-01-01` : `${y}-${pad(m + 1)}-01`;
    const c: Counts = { available: 0, reserved: 0, total: 0 };
    const seen = new Set<string>();
    for (const mapId of mapIds) {
      try {
        const data = await getJson(
          `${base}/api/availability/map?mapId=${mapId}&startDate=${startISO}&endDate=${end}&bookingCategoryId=0&nights=1`,
          `${base}/`,
        );
        raw[`${startISO}:${mapId}`] = data;
        for (const [rid, av] of Object.entries<any>(data.resourceAvailabilities ?? {})) {
          if (seen.has(rid) || !av?.length) continue;
          seen.add(rid);
          const label = WA_AVAIL[av[0].availability] ?? "other";
          if (label === "available") c.available++;
          else if (label === "reserved") c.reserved++;
          c.total++;
        }
      } catch {
        /* some sub-maps 403 — skip */
      }
    }
    by[startISO] = c;
  }
  return { raw, by };
}

export async function fetchAvailability(kind: "rec" | "wa", ref: string | number, months = 6) {
  return kind === "rec" ? fetchRecAvailability(String(ref), months) : fetchWaAvailability(ref, months);
}
