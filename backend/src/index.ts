import { Hono } from 'hono';
import { cors } from 'hono/cors';
import campsites from './campsites-index.json';

// Cloudflare Workflows must be exported from the entry module by class name.
export { CampsiteCollectorWorkflow, HotDateWatchWorkflow } from './workflows';

type Bindings = {
  CAMPSITES: KVNamespace;
  RAW: R2Bucket;
  COLLECTOR_WF: Workflow;
  WATCH_WF: Workflow;
};

export const app = new Hono<{ Bindings: Bindings }>();

// Enable CORS for frontend integration
app.use('/*', cors());

app.get('/', (c) => {
  return c.text('Robot Geographical Society Backend API');
});

// GET /campsite/:id - Fetch individual campsite details
app.get('/campsite/:id', async (c) => {
  const id = c.req.param('id');
  const campsite = await c.env.CAMPSITES.get(id, { type: 'json' });
  if (!campsite) {
    return c.json({ error: 'Campsite not found' }, 404);
  }
  return c.json(campsite);
});

// POST /seed - Seed the KV store with data (Dev only)
app.post('/seed', async (c) => {
  try {
    const data = await c.req.json();
    for (const item of data) {
      await c.env.CAMPSITES.put(item.key, item.value);
    }
    return c.json({ success: true, count: data.length });
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

// GET /campsites - List all campsite IDs (for debugging/development)
app.get('/campsites', async (c) => {
  const list = await c.env.CAMPSITES.list();
  return c.json(list.keys.map((k) => k.name));
});

// Trigger the daily collection Workflow on demand (the cron does this nightly).
app.post('/collect/run', async (c) => {
  const date = new Date().toISOString().slice(0, 10);
  const limit = Number(c.req.query('limit')) || undefined;
  // spread the run over N seconds (default 3600); window=0 means no pacing (run immediately)
  const wq = c.req.query('window');
  const wn = wq === undefined ? NaN : Number(wq);
  const windowSec = Number.isFinite(wn) ? wn : undefined;
  const i = await c.env.COLLECTOR_WF.create({ params: { date, limit, windowSec } });
  return c.json({ workflow: 'campsite-collector', instanceId: i.id, date, limit, windowSec: windowSec ?? 3600 });
});

// Watch a single (campsite, target_date) with adaptive cadence until sold out.
app.post('/watch', async (c) => {
  const id = c.req.query('id');
  const date = c.req.query('date');
  const every = c.req.query('every') || undefined; // e.g. "60 seconds" to demo the loop fast
  const site = (campsites as any[]).find((s) => s.id === id);
  if (!site || !date) return c.json({ error: 'need ?id=<campsite-index id>&date=YYYY-MM-DD [&every=]' }, 400);
  const i = await c.env.WATCH_WF.create({ params: { ...site, targetDate: date, every } });
  return c.json({ workflow: 'campsite-hot-date-watch', instanceId: i.id, watching: site.name, targetDate: date, every });
});

export default {
  fetch: app.fetch,
  // Daily cron → durable collection Workflow (one step.do per site, retry/resume).
  async scheduled(event: ScheduledEvent, env: Bindings, ctx: ExecutionContext) {
    const date = new Date(event.scheduledTime).toISOString().slice(0, 10);
    ctx.waitUntil(env.COLLECTOR_WF.create({ params: { date } }));
  },
};
