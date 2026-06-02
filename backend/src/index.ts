import { Hono } from 'hono';
import { cors } from 'hono/cors';
import campsites from './campsites-index.json';
import { collectSite, HEARTBEAT_KEY, type WfEnv } from './workflows';

// Cloudflare Workflows must be exported from the entry module by class name.
export { CollectorLoop, HotDateWatchWorkflow } from './workflows';

type Bindings = WfEnv & {
  CAMPSITES: KVNamespace;
  WATCH_WF: Workflow;
};

// If no heartbeat younger than this, the loop is considered dead → (re)start it.
const ALIVE_THRESHOLD_MS = 12 * 60 * 60_000;

async function loopAlive(env: Bindings): Promise<{ alive: boolean; hb?: any }> {
  const obj = await env.RAW.get(HEARTBEAT_KEY);
  if (!obj) return { alive: false };
  const hb: any = await obj.json();
  return { alive: typeof hb?.lastWakeMs === 'number' && Date.now() - hb.lastWakeMs < ALIVE_THRESHOLD_MS, hb };
}

export const app = new Hono<{ Bindings: Bindings }>();
app.use('/*', cors());

app.get('/', (c) => c.text('Robot Geographical Society Backend API'));

// GET /campsite/:id - Fetch individual campsite details (agency-prefixed slash ids).
app.get('/campsite/:id{.+}', async (c) => {
  const id = c.req.param('id');
  const campsite = await c.env.CAMPSITES.get(id, { type: 'json' });
  if (!campsite) return c.json({ error: 'Campsite not found' }, 404);
  return c.json(campsite);
});

// POST /seed - Seed the KV store with data (dev only).
app.post('/seed', async (c) => {
  try {
    const data = await c.req.json();
    for (const item of data) await c.env.CAMPSITES.put(item.key, item.value);
    return c.json({ success: true, count: data.length });
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

app.get('/campsites', async (c) => {
  const list = await c.env.CAMPSITES.list();
  return c.json(list.keys.map((k) => k.name));
});

// Start the deadline-driven collector loop (no-op if one is already alive).
app.post('/collect/start', async (c) => {
  const { alive, hb } = await loopAlive(c.env);
  if (alive) return c.json({ status: 'already-running', lastWakeISO: hb?.lastWakeISO });
  const i = await c.env.COLLECTOR_WF.create({ params: {} });
  return c.json({ status: 'started', instanceId: i.id });
});

// Freshness/observability snapshot (the loop's heartbeat).
app.get('/scheduler/status', async (c) => {
  const obj = await c.env.RAW.get(HEARTBEAT_KEY);
  if (!obj) return c.json({ status: 'no-heartbeat' });
  const hb: any = await obj.json();
  const now = Date.now();
  const dueVals: number[] = Object.values(hb.due ?? {});
  return c.json({
    lastWakeISO: hb.lastWakeISO,
    ageSeconds: Math.round((now - hb.lastWakeMs) / 1000),
    collectedTotal: hb.collectedTotal,
    sites: hb.sites,
    overdue: dueVals.filter((d) => d <= now).length,
  });
});

// Ad-hoc one-shot collection of a single campsite (backfill/debug) — independent
// of the loop's schedule.
app.post('/collect/site', async (c) => {
  const id = c.req.query('id');
  const site = (campsites as any[]).find((s) => s.id === id);
  if (!site) return c.json({ error: 'need ?id=<campsite id>' }, 400);
  const date = new Date().toISOString().slice(0, 10);
  try {
    const r = await collectSite(c.env, site, date);
    return c.json({ status: 'collected', ...r });
  } catch (e: any) {
    return c.json({ status: 'error', error: String(e?.message ?? e) }, 502);
  }
});

// Watch a single (campsite, target_date) with adaptive cadence until sold out.
app.post('/watch', async (c) => {
  const id = c.req.query('id');
  const date = c.req.query('date');
  const every = c.req.query('every') || undefined;
  const site = (campsites as any[]).find((s) => s.id === id);
  if (!site || !date) return c.json({ error: 'need ?id=<campsite id>&date=YYYY-MM-DD [&every=]' }, 400);
  const i = await c.env.WATCH_WF.create({ params: { ...site, targetDate: date, every } });
  return c.json({ workflow: 'campsite-hot-date-watch', instanceId: i.id, watching: site.name, targetDate: date, every });
});

export default {
  fetch: app.fetch,
  // Weekly liveness supervisor — NOT a collection schedule. It only restarts the
  // self-scheduling CollectorLoop if its heartbeat shows it has died.
  async scheduled(event: ScheduledEvent, env: Bindings, ctx: ExecutionContext) {
    ctx.waitUntil(
      (async () => {
        const { alive } = await loopAlive(env);
        if (!alive) await env.COLLECTOR_WF.create({ params: {} });
      })(),
    );
  },
};
