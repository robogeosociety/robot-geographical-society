import { expect, test, describe } from 'vitest';
import { app } from './index';
import { makeR2 } from '../test/stubs/r2';

// --- Ground-truth fixture (a known reservation) --------------------------------
// Middle Fork (USFS), night 2026-06-05: a real vault booking — Site 24 (internal
// siteId 81835) reserved that night; campground aggregate 0 available / 23 reserved
// / 35 total (+12 "other"). Verified against live R2. See WEBAPP_PLAN.md. The
// inventory ships the canonical guid/slug for this campground; the collector keys
// R2 on the provider id (rec.gov 234501).
const MF_GUID = '0c89950f-d0dc-594e-b48d-b1a5293027aa';
const MF_ID = '234501';
const DATE = '2026-06-05';

function seedR2() {
  return makeR2({
    [`summary/${DATE}/${MF_ID}.json`]: {
      id: MF_ID, name: 'Middle Fork', agency: 'usfs', kind: 'rec',
      by_date: { [DATE]: { available: 0, reserved: 23, total: 35 } },
    },
    [`sites/${DATE}/${MF_ID}.json`]: {
      id: MF_ID, name: 'Middle Fork', agency: 'usfs', kind: 'rec', collected_date: DATE,
      sites: {
        '81835': {
          label: '24', loop: 'AREA MIDDLE FORK CAMPGROUND', type: 'STANDARD NONELECTRIC', use: 'Overnight',
          by_date: { [DATE]: 'reserved', '2026-06-06': 'available' },
        },
        '81840': {
          label: '25', loop: 'AREA MIDDLE FORK CAMPGROUND', type: 'STANDARD NONELECTRIC', use: 'Overnight',
          by_date: { [DATE]: 'available' },
        },
      },
    },
  });
}

describe('/availability — aggregate map (the known reservation)', () => {
  test('GET /availability?date= returns the night aggregate keyed by guid', async () => {
    const RAW = seedR2();
    const res = await app.request(`/availability?date=${DATE}`, {}, { RAW } as any);
    expect(res.status).toBe(200);
    const body = await res.json();
    const mf = (body as any[]).find((e) => e.guid === MF_GUID);
    expect(mf).toMatchObject({
      guid: MF_GUID, name: 'Middle Fork', available: 0, reserved: 23, total: 35, collected_date: DATE,
    });
  });

  test('GET /availability requires a ?date=', async () => {
    const RAW = seedR2();
    const res = await app.request('/availability', {}, { RAW } as any);
    expect(res.status).toBe(400);
  });

  test('reports total remaining availability (nights on/after date)', async () => {
    const RAW = makeR2({
      [`summary/2026-06-01/${MF_ID}.json`]: {
        id: MF_ID,
        by_date: {
          '2026-05-01': { available: 9, reserved: 0, total: 9 }, // BEFORE date → excluded
          '2026-06-05': { available: 2, reserved: 1, total: 3 },
          '2026-06-06': { available: 1, reserved: 2, total: 3 },
          '2026-09-23': { available: 4, reserved: 0, total: 4 },
        },
      },
    });
    const res = await app.request('/availability?date=2026-06-05', {}, { RAW } as any);
    const mf = ((await res.json()) as any[]).find((e) => e.guid === MF_GUID);
    expect(mf.remaining).toBe(7); // 2+1+4 (05-01 excluded)
    expect(mf.remainingTotal).toBe(10); // 3+3+4
    expect(mf.remainingBySeason).toBeUndefined();
  });
});

describe('/availability/:guid — per-campground site list for a night', () => {
  test('lists sites with the human label and that night’s status', async () => {
    const RAW = seedR2();
    const res = await app.request(`/availability/${MF_GUID}?date=${DATE}`, {}, { RAW } as any);
    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(body.guid).toBe(MF_GUID);
    const site24 = body.sites.find((s: any) => s.siteId === '81835');
    expect(site24).toMatchObject({
      siteId: '81835', label: '24', loop: 'AREA MIDDLE FORK CAMPGROUND', status: 'reserved',
    });
  });

  test('unknown guid → 404', async () => {
    const RAW = seedR2();
    const res = await app.request(`/availability/not-a-guid?date=${DATE}`, {}, { RAW } as any);
    expect(res.status).toBe(404);
  });
});

describe('/availability/:guid/site/:siteId — one site’s calendar', () => {
  test('returns the per-night status calendar (siteId is the internal id, not the label)', async () => {
    const RAW = seedR2();
    const res = await app.request(`/availability/${MF_GUID}/site/81835`, {}, { RAW } as any);
    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(body.siteId).toBe('81835');
    expect(body.label).toBe('24');
    expect(body.by_date[DATE]).toBe('reserved');
    expect(body.by_date['2026-06-06']).toBe('available');
  });

  test('unknown siteId → 404', async () => {
    const RAW = seedR2();
    const res = await app.request(`/availability/${MF_GUID}/site/99999`, {}, { RAW } as any);
    expect(res.status).toBe(404);
  });
});

describe('/collectors — fleet health (current state, no history)', () => {
  // A heartbeat where Middle Fork is healthy (due in the future, no failures) and
  // some other rec site is overdue + failing.
  const NOW = Date.parse('2026-06-06T00:00:00Z');
  function seedWithHeartbeat() {
    const RAW = seedR2();
    RAW.put('scheduler/heartbeat.json', {
      lastWakeMs: NOW - 60_000,
      lastWakeISO: new Date(NOW - 60_000).toISOString(),
      collectedTotal: 999,
      sites: 140,
      due: { [MF_ID]: NOW + 86_400_000, '246855': NOW - 3_600_000 },
      fails: { '246855': 2 },
    });
    return RAW;
  }

  test('colors each inventory site by state', async () => {
    const RAW = seedWithHeartbeat();
    // Quarantine one site via the DLQ.
    RAW.put('dlq/246855.json', { id: '246855', name: 'Colonial Creek North', agency: 'nps', kind: 'rec', since: NOW, sinceISO: '', failures: 5, lastError: 'x' });
    const res = await app.request(`/collectors?now=${NOW}`, {}, { RAW } as any);
    expect(res.status).toBe(200);
    const body = (await res.json()) as any[];

    const mf = body.find((c) => c.guid === MF_GUID);
    expect(mf).toMatchObject({ state: 'healthy', collect: true, lastCollectedDate: DATE });

    // collect:false (BLM) → disabled regardless of heartbeat.
    const disabled = body.find((c) => c.guid === 'fc77ed90-72f0-5ece-a818-93153d2140b7');
    expect(disabled).toMatchObject({ state: 'disabled', collect: false });

    // In the DLQ → quarantined (wins over overdue/failing).
    const quarantined = body.find((c) => c.guid === '526a9c1d-814b-5019-991b-1abb73c7340d');
    expect(quarantined?.state).toBe('quarantined');

    // Every inventory entry is represented.
    expect(body.length).toBe(156);
  });

  test('overdue/failing when due has passed and no DLQ entry', async () => {
    const RAW = seedWithHeartbeat(); // 246855 due in the past + fails:2, not quarantined
    const res = await app.request(`/collectors?now=${NOW}`, {}, { RAW } as any);
    const body = (await res.json()) as any[];
    const overdue = body.find((c) => c.guid === '526a9c1d-814b-5019-991b-1abb73c7340d');
    expect(overdue?.state).toBe('overdue');
    expect(overdue?.fails).toBe(2);
  });

  test('reads the inventory from KV (_inventory) when present, not the bundled JSON', async () => {
    const RAW = seedWithHeartbeat();
    // KV serves a one-entry inventory — /collectors must reflect *that*, proving KV is
    // the runtime source of truth (the bundled JSON has 156 entries).
    const CAMPSITES = {
      get: async (k: string) =>
        k === '_inventory'
          ? [{ id: '777', guid: 'guid-kv-only', name: 'KV-only Camp', kind: 'rec', ref: '777', agency: 'usfs', collect: true }]
          : null,
    } as unknown as KVNamespace;

    const res = await app.request(`/collectors?now=${NOW}`, {}, { RAW, CAMPSITES } as any);
    const body = (await res.json()) as any[];
    expect(body).toHaveLength(1);
    expect(body[0]).toMatchObject({ guid: 'guid-kv-only', name: 'KV-only Camp' });
  });
});

// The Cache-API edge layer is a no-op under Node tests (no `caches` global), but the
// browser-facing Cache-Control directive is still stamped — that's what lets the
// browser HTTP cache honor the same TTL as the localStorage layer. Errors stay
// uncached so a bad request is never sticky.
describe('read endpoints — browser cache directives', () => {
  test('a 200 read carries a private, max-age Cache-Control', async () => {
    const RAW = seedR2();
    const avail = await app.request(`/availability?date=${DATE}`, {}, { RAW } as any);
    expect(avail.headers.get('Cache-Control')).toBe('private, max-age=600');

    const fleet = await app.request('/collectors', {}, { RAW } as any);
    expect(fleet.headers.get('Cache-Control')).toBe('private, max-age=60');
  });

  test('errors are not stamped (no sticky 400/404)', async () => {
    const RAW = seedR2();
    const bad = await app.request('/availability', {}, { RAW } as any); // 400, missing ?date=
    expect(bad.status).toBe(400);
    expect(bad.headers.get('Cache-Control')).toBeNull();

    const missing = await app.request(`/availability/not-a-guid?date=${DATE}`, {}, { RAW } as any); // 404
    expect(missing.status).toBe(404);
    expect(missing.headers.get('Cache-Control')).toBeNull();
  });
});
