/**
 * Read-only availability + collector-health endpoints for the two-view webapp
 * (see WEBAPP_PLAN.md). These read the banked R2 snapshots the collector writes —
 * they never hit the upstream providers.
 *
 * Id model: the browser keys everything on the canonical **guid**; the inventory
 * (`campsites-index.json`) maps `guid → provider id` (rec.gov campground id or WA
 * resourceLocation id), and R2 is keyed by provider id. The Worker does that
 * translation so the frontend never sees provider-id quirks.
 *
 * R2 layout (keyed by provider id):
 *   summary/<collectionDate>/<id>.json → { by_date: { night → {available,reserved,total} } }
 *   sites/<collectionDate>/<id>.json   → { collected_date, sites: { siteId → {label,loop,type,use,by_date} } }
 *   dlq/<id>.json                      → quarantine marker
 *   scheduler/heartbeat.json           → { due:{id→deadlineMs}, fails:{id→count}, lastWakeMs }
 *
 * "Freshness": a campground is collected on its own cadence, so the newest snapshot
 * for a given id may sit in any recent date-partition. We resolve newest-per-id by
 * walking the partitions newest→oldest (bounded lookback). The per-date rollup
 * `summary/<date>/_index.json` (checkpoint 2) will collapse the bulk fan-out to one
 * read; until then the bulk endpoints fan out (cheap for /collectors, the one place
 * the WEBAPP_PLAN flags for the Cache-API/rollup optimization is /availability?date=).
 */
import { Hono, type MiddlewareHandler } from 'hono';
import { loadInventory, type InventoryEntry } from './inventory';

// Edge cache for the shared, identity-independent read endpoints. The colo caches the
// computed JSON (keyed by request URL) via the Workers Cache API, so the first caller
// per colo per TTL pays the R2 fan-out and every other request — other users, other
// devices, reloads past the browser's localStorage window — is served in ~1ms with
// zero R2 reads. Safe to share: these responses are identical for all users (only /me
// and the admin/mutation routes are identity-specific, and none of those are wrapped),
// and Cloudflare Access gates upstream of the Worker, so the cache is only ever reached
// by an already-authenticated request.
//
// Two directives, deliberately different:
//   - stored copy: `max-age` only — the Workers Cache API refuses to store `private`.
//   - browser copy: `private, max-age` — so nothing between the Worker and the browser
//     caches it across identities, while the browser still honors the TTL.
// A no-op where the Cache API is absent (Node tests): it just stamps the browser
// directive and passes through.
function edgeCache(maxAge: number): MiddlewareHandler {
  const browserCC = `private, max-age=${maxAge}`;
  const edgeCC = `max-age=${maxAge}`;
  const store = (): Cache | null =>
    typeof caches !== 'undefined' ? (caches as unknown as { default: Cache }).default : null;

  return async (c, next) => {
    const cache = store();
    if (cache) {
      const hit = await cache.match(c.req.raw);
      if (hit) {
        const res = new Response(hit.body, hit);
        res.headers.set('Cache-Control', browserCC); // never hand the edge directive to the browser
        return res;
      }
    }

    await next();
    if (!c.res || !c.res.ok) return; // don't cache or stamp errors (400/404)

    if (cache) {
      const copy = new Response(c.res.clone().body, c.res);
      copy.headers.set('Cache-Control', edgeCC);
      try {
        c.executionCtx.waitUntil(cache.put(c.req.raw, copy));
      } catch {
        // no executionCtx (direct app.request in tests) — skip the background store
      }
    }
    const out = new Response(c.res.body, c.res);
    out.headers.set('Cache-Control', browserCC);
    c.res = out;
  };
}

// CAMPSITES (KV) holds the authoritative inventory under `_inventory`; RAW (R2) holds
// the collected snapshots. The inventory is read per request (loadInventory) so a
// deploy that refreshes KV is reflected without a Worker redeploy.
type ReadEnv = { RAW: R2Bucket; CAMPSITES?: KVNamespace };

// Per-request inventory + guid index. Rebuilding the Map each request is negligible
// next to the R2 fan-out these handlers already do.
async function inventoryFor(env: ReadEnv): Promise<{ inventory: InventoryEntry[]; byGuid: Map<string, InventoryEntry> }> {
  const inventory = await loadInventory(env.CAMPSITES);
  return { inventory, byGuid: new Map(inventory.map((e) => [e.guid, e])) };
}

// How many recent date-partitions to scan when resolving the newest snapshot per
// site. Collection cadence is ~daily within MAX_STALENESS_DAYS, but a quarantined
// or long-stale site can sit further back; 30 partitions is a generous bound that
// keeps the listing cheap.
const LOOKBACK_PARTITIONS = 30;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

type Counts = { available: number; reserved: number; total: number };

async function listAll(env: ReadEnv, opts: { prefix: string; delimiter?: string }) {
  const objects: { key: string }[] = [];
  const delimited: string[] = [];
  let cursor: string | undefined;
  do {
    const r: any = await env.RAW.list({ ...opts, cursor } as any);
    objects.push(...(r.objects ?? []));
    delimited.push(...(r.delimitedPrefixes ?? []));
    cursor = r.truncated ? r.cursor : undefined;
  } while (cursor);
  return { objects, delimitedPrefixes: delimited };
}

/** Recent collection-date partitions under `top/`, newest first (bounded). */
async function partitionDates(env: ReadEnv, top: 'summary' | 'sites'): Promise<string[]> {
  const root = `${top}/`;
  const { delimitedPrefixes } = await listAll(env, { prefix: root, delimiter: '/' });
  return delimitedPrefixes
    .map((p) => p.slice(root.length).replace(/\/$/, ''))
    .filter((d) => DATE_RE.test(d))
    .sort()
    .reverse()
    .slice(0, LOOKBACK_PARTITIONS);
}

/** newest collection-date per provider id (newest-partition-wins). */
async function latestByProvider(env: ReadEnv, top: 'summary' | 'sites'): Promise<Map<string, string>> {
  const root = `${top}/`;
  const latest = new Map<string, string>();
  for (const d of await partitionDates(env, top)) {
    const { objects } = await listAll(env, { prefix: `${root}${d}/` });
    for (const o of objects) {
      const id = o.key.slice(`${root}${d}/`.length).replace(/\.json$/, '');
      if (id && id !== '_index' && !latest.has(id)) latest.set(id, d);
    }
  }
  return latest;
}

/** newest collection-date that has a snapshot for one specific provider id. */
async function latestPartitionFor(env: ReadEnv, top: 'summary' | 'sites', id: string): Promise<string | null> {
  const root = `${top}/`;
  for (const d of await partitionDates(env, top)) {
    if (await env.RAW.head(`${root}${d}/${id}.json`)) return d;
  }
  return null;
}

async function getJson<T>(env: ReadEnv, key: string): Promise<T | null> {
  const obj = await env.RAW.get(key);
  return obj ? ((await obj.json()) as T) : null;
}

export const readApi = new Hono<{ Bindings: ReadEnv }>();

// GET /availability?date=YYYY-MM-DD[&collected=YYYY-MM-DD]
// Every campground's aggregate availability for the requested night, keyed by guid,
// projected from each site's freshest summary snapshot.
readApi.get('/availability', edgeCache(600), async (c) => {
  const date = c.req.query('date');
  if (!date || !DATE_RE.test(date)) return c.json({ error: 'need ?date=YYYY-MM-DD' }, 400);
  const pinned = c.req.query('collected');

  const { inventory } = await inventoryFor(c.env);
  const latest = pinned
    ? new Map(inventory.map((e) => [e.id, pinned]))
    : await latestByProvider(c.env, 'summary');

  const out: any[] = [];
  for (const e of inventory) {
    const collDate = latest.get(e.id);
    if (!collDate) continue;
    const snap = await getJson<{ by_date?: Record<string, Counts> }>(c.env, `summary/${collDate}/${e.id}.json`);
    if (!snap) continue;
    const byDate = snap.by_date ?? {};
    const counts = byDate[date] ?? null;

    // Total REMAINING availability for the campground: available campsite-nights summed
    // across every captured night on/after `date`. This is the map's default metric
    // (and the per-pin availability disc).
    let remaining = 0;
    let remainingTotal = 0;
    for (const [d, cnt] of Object.entries(byDate)) {
      if (d < date) continue;
      remaining += cnt?.available ?? 0;
      remainingTotal += cnt?.total ?? 0;
    }

    out.push({
      guid: e.guid,
      name: e.name,
      agency: e.agency_full ?? e.agency ?? null,
      lat: e.lat ?? null,
      lng: e.lng ?? null,
      available: counts?.available ?? null,
      reserved: counts?.reserved ?? null,
      total: counts?.total ?? null,
      remaining,
      remainingTotal,
      collected_date: collDate,
    });
  }
  return c.json(out);
});

// GET /availability/:guid/site/:siteId — one site's per-night status calendar.
// :siteId is the internal R2 site id (e.g. 81835), NOT the human label ("24").
readApi.get('/availability/:guid/site/:siteId', edgeCache(300), async (c) => {
  const { byGuid } = await inventoryFor(c.env);
  const entry = byGuid.get(c.req.param('guid'));
  if (!entry) return c.json({ error: 'unknown guid' }, 404);
  const siteId = c.req.param('siteId');

  const collDate = await latestPartitionFor(c.env, 'sites', entry.id);
  const snap = collDate
    ? await getJson<{ sites?: Record<string, any> }>(c.env, `sites/${collDate}/${entry.id}.json`)
    : null;
  const site = snap?.sites?.[siteId];
  if (!site) return c.json({ error: 'site not found' }, 404);

  return c.json({
    guid: entry.guid,
    siteId,
    label: site.label ?? null,
    loop: site.loop ?? null,
    type: site.type ?? null,
    use: site.use ?? null,
    collected_date: collDate,
    by_date: site.by_date ?? {},
  });
});

// GET /availability/:guid?date= — the per-campground site list for one night.
// The "individual site number" filter resolves the human `label` ("24") → siteId
// against this list, so we surface both.
readApi.get('/availability/:guid', edgeCache(300), async (c) => {
  const { byGuid } = await inventoryFor(c.env);
  const entry = byGuid.get(c.req.param('guid'));
  if (!entry) return c.json({ error: 'unknown guid' }, 404);
  const date = c.req.query('date');
  if (!date || !DATE_RE.test(date)) return c.json({ error: 'need ?date=YYYY-MM-DD' }, 400);

  const collDate = await latestPartitionFor(c.env, 'sites', entry.id);
  const snap = collDate
    ? await getJson<{ sites?: Record<string, any> }>(c.env, `sites/${collDate}/${entry.id}.json`)
    : null;

  const sites = Object.entries(snap?.sites ?? {}).map(([siteId, s]: [string, any]) => ({
    siteId,
    label: s.label ?? null,
    loop: s.loop ?? null,
    type: s.type ?? null,
    use: s.use ?? null,
    status: s.by_date?.[date] ?? null,
  }));
  return c.json({ guid: entry.guid, name: entry.name, date, collected_date: collDate, sites });
});

// GET /collectors[?now=ms] — fleet health, current state only (no run-history;
// that's the InfluxDB-backed /collectors/:guid/history, deferred). One row per
// inventory site, colored by state.
readApi.get('/collectors', edgeCache(60), async (c) => {
  const now = Number(c.req.query('now')) || Date.now();
  const hb = (await getJson<any>(c.env, 'scheduler/heartbeat.json')) ?? {};
  const due: Record<string, number> = hb.due ?? {};
  const fails: Record<string, number> = hb.fails ?? {};

  const { objects } = await listAll(c.env, { prefix: 'dlq/' });
  const quarantined = new Set(objects.map((o) => o.key.slice('dlq/'.length).replace(/\.json$/, '')));

  const lastDates = await latestByProvider(c.env, 'summary');

  const { inventory } = await inventoryFor(c.env);
  const out = inventory.map((e) => {
    const collect = e.collect !== false;
    const lastCollectedDate = lastDates.get(e.id) ?? null;
    const ageDays = lastCollectedDate ? Math.floor((now - Date.parse(lastCollectedDate)) / 86_400_000) : null;
    const deadline = due[e.id];
    const fail = fails[e.id] ?? 0;

    let state: 'disabled' | 'quarantined' | 'overdue' | 'healthy';
    if (!collect) state = 'disabled';
    else if (quarantined.has(e.id)) state = 'quarantined';
    else if ((deadline != null && deadline <= now) || fail > 0) state = 'overdue';
    else state = 'healthy';

    return {
      guid: e.guid,
      name: e.name,
      agency: e.agency_full ?? e.agency ?? null,
      lat: e.lat ?? null,
      lng: e.lng ?? null,
      collect,
      state,
      lastCollectedDate,
      ageDays,
      dueMs: deadline != null ? deadline - now : null,
      fails: fail,
    };
  });
  return c.json(out);
});

// GET /collectors/:guid/history — run-history sparkline. Deferred: reads the
// observability InfluxDB (localhost:8086) and only wires up once the app runs
// against a local server. Returns 501 until then.
readApi.get('/collectors/:guid/history', (c) =>
  c.json({ error: 'run-history not implemented yet (InfluxDB-backed; pending local wiring)' }, 501),
);
