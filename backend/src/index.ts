import { Hono } from 'hono';
import { cors } from 'hono/cors';

type Bindings = {
  CAMPSITES: KVNamespace;
};

const app = new Hono<{ Bindings: Bindings }>();

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

export default app;
