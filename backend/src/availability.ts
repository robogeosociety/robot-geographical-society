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

// Per-individual-campsite detail — preserved instead of collapsed into Counts.
// `by_date` mirrors the aggregate's keys (daily for rec.gov, monthly for WA).
export type SiteStatus = "available" | "reserved" | "other";
export type PerSite = {
  label: string | null; // site number / loop label (e.g. "A012"); null until enriched (WA)
  loop: string | null;
  type: string | null; // campsite type (e.g. "STANDARD NONELECTRIC")
  use: string | null; // type of use (e.g. "Overnight")
  by_date: Record<string, SiteStatus>;
};
export type BySite = Record<string, PerSite>;

function recStatus(status: string): SiteStatus {
  const s = String(status).toLowerCase();
  if (s === "available") return "available";
  if (s === "reserved") return "reserved";
  return "other";
}

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
  const bySite: BySite = {};
  for (const { y, m } of monthStarts(start, months)) {
    const sd = `${y}-${pad(m)}-01T00:00:00.000Z`;
    const data = await getJson(
      `https://www.recreation.gov/api/camps/availability/campground/${id}/month?start_date=${encodeURIComponent(sd)}`,
      `https://www.recreation.gov/camping/campgrounds/${id}`,
    );
    raw[`${y}-${pad(m)}`] = data;
    for (const site of Object.values<any>(data.campsites ?? {})) {
      const sid = String(site.campsite_id ?? site.site ?? "");
      const ps = (bySite[sid] ??= {
        label: site.site ?? null,
        loop: site.loop ?? null,
        type: site.campsite_type ?? null,
        use: site.type_of_use ?? null,
        by_date: {},
      });
      for (const [ds, status] of Object.entries<string>(site.availabilities ?? {})) {
        const day = ds.slice(0, 10);
        const c = (by[day] ??= { available: 0, reserved: 0, total: 0 });
        const label = recStatus(status);
        if (label === "available") c.available++;
        else if (label === "reserved") c.reserved++;
        c.total++;
        ps.by_date[day] = label;
      }
    }
  }
  return { raw, by, bySite };
}

const WA_AVAIL: Record<number, "available" | "reserved" | "other"> = {
  0: "available", 5: "available", 1: "reserved", 2: "other", 3: "other", 4: "other",
};

// "YYYY-MM-DD" + n days, as a UTC ISO date string (lexicographically comparable).
function addDaysISO(iso: string, n: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + n));
  return `${dt.getUTCFullYear()}-${pad(dt.getUTCMonth() + 1)}-${pad(dt.getUTCDate())}`;
}

export async function fetchWaAvailability(ref: number | string, months = 6, start = new Date()) {
  const base = "https://washington.goingtocamp.com";
  const maps = await getJson(`${base}/api/maps?resourceLocationId=${ref}&bookingCategoryId=0`, `${base}/`);
  const mapIds = (Array.isArray(maps) ? maps : []).map((m: any) => m.mapId).filter(Boolean);

  // Resolve per-resource site labels once per park (resourceId → site name, e.g. "A12").
  const labels: Record<string, string | null> = {};
  try {
    const resmap = await getJson(`${base}/api/resourcelocation/resources?resourceLocationId=${ref}`, `${base}/`);
    for (const [rid, r] of Object.entries<any>(resmap ?? {})) labels[rid] = r?.localizedValues?.[0]?.name ?? null;
  } catch {
    /* labels are best-effort — fall back to null */
  }

  const raw: Record<string, any> = {};
  const bySite: BySite = {};
  for (const { y, m } of monthStarts(start, months)) {
    const startISO = `${y}-${pad(m)}-01`;
    const end = m === 12 ? `${y + 1}-01-01` : `${y}-${pad(m + 1)}-01`;
    for (const mapId of mapIds) {
      try {
        // getDailyAvailability=true → resourceAvailabilities[rid] is a per-night
        // array (index i = startISO + i days), not a single range rollup.
        const data = await getJson(
          `${base}/api/availability/map?mapId=${mapId}&startDate=${startISO}&endDate=${end}&bookingCategoryId=0&nights=1&getDailyAvailability=true`,
          `${base}/`,
        );
        raw[`${startISO}:${mapId}`] = data;
        for (const [rid, arr] of Object.entries<any>(data.resourceAvailabilities ?? {})) {
          if (!Array.isArray(arr) || !arr.length) continue;
          const ps = (bySite[rid] ??= { label: labels[rid] ?? null, loop: null, type: null, use: null, by_date: {} });
          for (let i = 0; i < arr.length; i++) {
            const day = addDaysISO(startISO, i);
            if (day >= end) break; // boundary night belongs to the next month's query
            ps.by_date[day] = WA_AVAIL[arr[i]?.availability] ?? "other";
          }
        }
      } catch {
        /* some sub-maps 403 — skip */
      }
    }
  }

  // Aggregate is a derived sum over per-site (deduped by resourceId across maps), now daily.
  const by: ByDate = {};
  for (const ps of Object.values(bySite)) {
    for (const [day, status] of Object.entries(ps.by_date)) {
      const c = (by[day] ??= { available: 0, reserved: 0, total: 0 });
      if (status === "available") c.available++;
      else if (status === "reserved") c.reserved++;
      c.total++;
    }
  }
  return { raw, by, bySite };
}

export async function fetchAvailability(kind: "rec" | "wa", ref: string | number, months = 6, start = new Date()) {
  return kind === "rec" ? fetchRecAvailability(String(ref), months, start) : fetchWaAvailability(ref, months, start);
}
