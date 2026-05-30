import { Hono } from 'hono';
import { cors } from 'hono/cors';
import type { Env as CollectorEnv, Job } from './collector';

type Bindings = {
  CAMPSITES: KVNamespace;
} & CollectorEnv;

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

// Manual trigger for the daily collection (useful for testing the producer).
app.post('/collect/run', async (c) => {
  const { runProducer } = await import('./collector');
  const limit = Number(c.req.query('limit')) || undefined;
  const n = await runProducer(c.env, limit);
  return c.json({ enqueued: n });
});

// collector.ts pulls in @cloudflare/playwright (a Workers-runtime module), so it's
// dynamically imported only when the cron/queue actually fires — keeps it out of
// the API cold-start path and out of the vitest (Node) module graph.
export default {
  fetch: app.fetch,
  // Cron producer: enqueue one message per reservable campsite.
  async scheduled(_event: ScheduledEvent, env: Bindings, ctx: ExecutionContext) {
    ctx.waitUntil(import('./collector').then((m) => m.runProducer(env)));
  },
  // Queue consumer: drain a batch, scrape via Browser Rendering, write to R2.
  async queue(batch: MessageBatch<Job>, env: Bindings) {
    const { processBatch } = await import('./collector');
    await processBatch(batch, env);
  },
};
