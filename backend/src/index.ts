import { Hono } from 'hono';
import { cors } from 'hono/cors';
import campsites from './campsites-index.json';
import { collectSite, HEARTBEAT_KEY, DLQ_PREFIX, listDlqIds, type WfEnv, type DlqEntry } from './workflows';
import { readApi, edgeCache } from './read-api';
import { whoami, adminOnly, keyOk, ROLE_PREFIX } from './auth';
import { listSubscriptions, getSubscription, putSubscription, deleteSubscription, type Subscription } from './subscriptions';
import { handleInteraction } from './discord-interactions';

// Cloudflare Workflows must be exported from the entry module by class name.
export { CollectorLoop, HotDateWatchWorkflow } from './workflows';
export { ReadinessWorkflow } from './readiness-workflow';

type Bindings = WfEnv & {
  CAMPSITES: KVNamespace;
  WATCH_WF: Workflow;
  BOOTSTRAP_ADMIN?: string; // email that is always admin (RBAC bootstrap)
  DISCORD_APP_PUBLIC_KEY?: string; // for verifying Discord interaction signatures
  RGS_KEY?: string; // wrangler secret — the 404-wall pre-shared key (unset = local dev, wall open)
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

// Discord interactions endpoint — signature-verified (Ed25519), publicly reachable.
// Registered BEFORE the wall middleware below, so it is the one carve-out: Discord's
// servers can always POST here; the signature check is its gate.
app.post('/discord/interactions', async (c) => {
  return handleInteraction(c.req.raw, c.env);
});

// ---- The 404 wall (tailnet migration Phase 2) --------------------------------
// The public face of the whole domain is a blank 404. This Worker answers
// api.robogeosociety.xyz (custom domain) plus the apex/www zone routes (see
// wrangler.toml); any request that doesn't bear the pre-shared X-RGS-Key gets an
// empty-handed 404 before routing — no login redirect, no team-name leak, no hint
// that anything exists. Key bearers (the mini's tailnet proxy, vault_sync,
// rgs-admin) pass through and are admin (auth.ts). Unset RGS_KEY (local
// `wrangler dev`) leaves the wall open.
app.use('/*', async (c, next) => {
  if (!c.env.RGS_KEY || (await keyOk(c.env, c.req.raw))) return next();
  return c.text('404 Not Found', 404);
});

app.use('/*', cors());

app.get('/', (c) => c.text('Robot Geographical Society Backend API'));

// Read-only availability + collector-health endpoints (the two-view webapp).
app.route('/', readApi);

// --- Identity & RBAC ---------------------------------------------------------
// Who the caller is (from the Access identity) and their role. The frontend uses this
// to show/hide admin actions; the backend enforces regardless (adminOnly below).
app.get('/me', async (c) => c.json(await whoami(c.env, c.req.raw)));

// Admin-only role management. BOOTSTRAP_ADMIN is always admin (not stored); these grant
// or revoke admin for other emails.
app.get('/admin/users', adminOnly(), async (c) => {
  const list = await c.env.CAMPSITES.list({ prefix: ROLE_PREFIX });
  const users = list.keys.map((k) => ({ email: k.name.slice(ROLE_PREFIX.length), role: 'admin' }));
  return c.json({ bootstrapAdmin: c.env.BOOTSTRAP_ADMIN ?? null, users });
});

app.post('/admin/elevate', adminOnly(), async (c) => {
  const email = (c.req.query('email') ?? '').toLowerCase();
  if (!email) return c.json({ error: 'need ?email=' }, 400);
  await c.env.CAMPSITES.put(`${ROLE_PREFIX}${email}`, 'admin');
  return c.json({ email, role: 'admin' });
});

app.post('/admin/demote', adminOnly(), async (c) => {
  const email = (c.req.query('email') ?? '').toLowerCase();
  if (!email) return c.json({ error: 'need ?email=' }, 400);
  if (c.env.BOOTSTRAP_ADMIN && email === c.env.BOOTSTRAP_ADMIN.toLowerCase()) {
    return c.json({ error: 'cannot demote the bootstrap admin' }, 400);
  }
  await c.env.CAMPSITES.delete(`${ROLE_PREFIX}${email}`);
  return c.json({ email, role: 'viewer' });
});

// GET /campsite/:id - Fetch individual campsite details (agency-prefixed slash ids).
app.get('/campsite/:id{.+}', async (c) => {
  const id = c.req.param('id');
  const campsite = await c.env.CAMPSITES.get(id, { type: 'json' });
  if (!campsite) return c.json({ error: 'Campsite not found' }, 404);
  return c.json(campsite);
});

// POST /seed - Seed the KV store with data (dev only).
app.post('/seed', adminOnly(), async (c) => {
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

// Start the deadline-driven collector loop. No-op if a fresh heartbeat shows one
// already alive, unless ?force=1 (use after a crash/terminate, e.g. in response to
// a staleness alert — the heartbeat can read "alive" even when no instance runs).
app.post('/collect/start', adminOnly(), async (c) => {
  const force = c.req.query('force') === '1';
  const { alive, hb } = await loopAlive(c.env);
  if (alive && !force) return c.json({ status: 'already-running', lastWakeISO: hb?.lastWakeISO });
  const i = await c.env.COLLECTOR_WF.create({ params: {} });
  return c.json({ status: 'started', instanceId: i.id, forced: force });
});

// Start (or re-kick) the daily prediction-readiness Workflow. Like the collector
// loop it self-perpetuates via continue-as-new, so this is normally a one-time start
// (e.g. after first deploy or a crash). Idempotent enough: a duplicate instance just
// writes the same singleton campsite_readiness row.
app.post('/readiness/start', adminOnly(), async (c) => {
  const i = await c.env.READINESS_WF.create({ params: {} });
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
    inactive: hb.inactive ?? 0,
    overdue: dueVals.filter((d) => d <= now).length,
  });
});

// The dead-letter queue: sites quarantined after too many consecutive failures.
// Each entry is dlq/<id>.json in R2 (the source of truth for "inactive"). Edge-cached
// for 60s to match /collectors — the fleet view loads the two together, and this is
// shared, identity-independent data. reactivate() busts the browser copy; the edge
// self-heals within the short TTL.
app.get('/collect/dlq', edgeCache(60), async (c) => {
  const list = await c.env.RAW.list({ prefix: DLQ_PREFIX });
  const entries = await Promise.all(
    list.objects.map(async (o) => (await c.env.RAW.get(o.key))?.json<DlqEntry>()),
  );
  const dlq = entries.filter(Boolean) as DlqEntry[];
  return c.json({ count: dlq.length, sites: dlq.sort((a, b) => b.since - a.since) });
});

// Reactivate a quarantined site: drop its DLQ entry. The CollectorLoop reconciles
// against the DLQ each wake, so the site is re-armed for collection on the next
// wake (or sooner via the daily probe). No-op-safe if the id isn't quarantined.
app.post('/collect/reactivate', adminOnly(), async (c) => {
  const id = c.req.query('id');
  if (!id) return c.json({ error: 'need ?id=<campsite id>' }, 400);
  const key = `${DLQ_PREFIX}${id}.json`;
  const existed = (await c.env.RAW.head(key)) !== null;
  await c.env.RAW.delete(key);
  return c.json({ status: existed ? 'reactivated' : 'not-quarantined', id });
});

// Ad-hoc one-shot collection of a single campsite (backfill/debug) — independent
// of the loop's schedule.
app.post('/collect/site', adminOnly(), async (c) => {
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
app.post('/watch', adminOnly(), async (c) => {
  const id = c.req.query('id');
  const date = c.req.query('date');
  const every = c.req.query('every') || undefined;
  const site = (campsites as any[]).find((s) => s.id === id);
  if (!site || !date) return c.json({ error: 'need ?id=<campsite id>&date=YYYY-MM-DD [&every=]' }, 400);
  const i = await c.env.WATCH_WF.create({ params: { ...site, targetDate: date, every } });
  return c.json({ workflow: 'campsite-hot-date-watch', instanceId: i.id, watching: site.name, targetDate: date, every });
});

// --- Subscriptions -----------------------------------------------------------

app.get('/subscriptions', adminOnly(), async (c) => {
  const subs = await listSubscriptions(c.env.CAMPSITES);
  return c.json({ count: subs.length, subscriptions: subs });
});

app.get('/subscriptions/:id', adminOnly(), async (c) => {
  const sub = await getSubscription(c.env.CAMPSITES, c.req.param('id'));
  if (!sub) return c.json({ error: 'Subscription not found' }, 404);
  return c.json(sub);
});

app.post('/subscriptions', adminOnly(), async (c) => {
  const body = await c.req.json<Partial<Subscription>>();
  if (!body.campgroundId) return c.json({ error: 'campgroundId is required' }, 400);

  const known = (campsites as any[]).find((s) => s.id === body.campgroundId);
  if (!known) return c.json({ error: `Unknown campground: ${body.campgroundId}` }, 400);

  if (body.weekdays?.length) {
    if (body.weekdays.some((d) => d < 0 || d > 6)) {
      return c.json({ error: 'weekdays must be 0 (Sun) – 6 (Sat)' }, 400);
    }
  }

  const sub: Subscription = {
    id: body.id ?? crypto.randomUUID(),
    campgroundId: body.campgroundId,
    siteLabel: body.siteLabel ?? null,
    dates: body.dates ?? undefined,
    weekdays: body.weekdays ?? undefined,
    note: body.note ?? undefined,
    createdAt: new Date().toISOString(),
  };
  await putSubscription(c.env.CAMPSITES, sub);
  return c.json(sub, 201);
});

app.delete('/subscriptions/:id', adminOnly(), async (c) => {
  const id = c.req.param('id');
  const existed = await deleteSubscription(c.env.CAMPSITES, id);
  return c.json({ status: existed ? 'deleted' : 'not-found', id });
});

// No scheduled() handler / cron. The CollectorLoop self-perpetuates via
// continue-as-new; staleness is surfaced by Grafana → Discord alerting (see the
// observability repo), and a human restarts with POST /collect/start?force=1.
export default { fetch: app.fetch };
