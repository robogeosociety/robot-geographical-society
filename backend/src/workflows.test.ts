import { expect, test, describe, vi } from 'vitest';

// Mock the availability fetch so collectSite() gets a deterministic aggregate.
vi.mock('./availability', () => ({
  fetchAvailability: vi.fn(async () => ({
    raw: { ok: true },
    by: {
      '2026-07-01': { available: 3, reserved: 1, total: 4 },
      '2026-07-02': { available: 0, reserved: 4, total: 4 },
    },
    bySite: {},
  })),
}));

import { collectSite, appendWatchPoint, watchKey, type WfEnv, type WatchCurve } from './workflows';
import { makeR2 } from '../test/stubs/r2';

function spyEnv() {
  const calls = { collector: 0, avail: 0, demand: 0 };
  const env = {
    RAW: { put: vi.fn(async () => undefined) },
    COLLECTOR_AE: { writeDataPoint: vi.fn(() => { calls.collector++; }) },
    AVAIL_AE: { writeDataPoint: vi.fn(() => { calls.avail++; }) },
    DEMAND_AE: { writeDataPoint: vi.fn(() => { calls.demand++; }) },
  } as unknown as WfEnv;
  return { env, calls };
}

const SITE = { id: '233864', name: 'Kalaloch', agency: 'nps', kind: 'rec', ref: '233864' } as never;

describe('collectSite AE writes — bounded per invocation', () => {
  // Regression guard for the AE "write limit exceeded" outage (#103): the loop
  // collects many sites per workflow invocation, so collectSite must write a SMALL,
  // fixed number of AE rows. Per-night demand (~240/site) is re-homed in a separate
  // Workflow; here collectSite must spend exactly 2 writes (collector + availability).
  test('writes exactly collector + availability, and NO per-night demand', async () => {
    const { env, calls } = spyEnv();
    await collectSite(env, SITE, '2026-06-20');
    expect(calls.collector).toBe(1);
    expect(calls.avail).toBe(1);
    expect(calls.demand).toBe(0); // must NOT spam DEMAND_AE from the hot path
  });
});

const WATCH_SITE = {
  id: '233864', name: 'Kalaloch', agency: 'nps', kind: 'rec', ref: '233864',
  targetDate: '2026-07-04', lat: 47.6, lng: -124.4,
} as never;

describe('appendWatchPoint — fill-curve banked to R2 (AE → R2 re-plumb, #107 item 2)', () => {
  // The hot-date watcher no longer writes the campsite_watch Analytics Engine dataset;
  // it appends each observation to ONE R2 object (watch/<id>/<targetDate>.json) so the
  // webapp can read the whole fill-curve in a single get. There is no AE binding in the
  // env here — if the workflow still tried to write AE, it would throw.
  test('seeds the curve object on the first observation', async () => {
    const RAW = makeR2();
    const env = { RAW } as unknown as WfEnv;
    const curve = await appendWatchPoint(
      env, WATCH_SITE,
      { ts: '2026-06-21T10:00:00.000Z', available: 8, reserved: 2, total: 10 },
      false, false,
    );
    expect(curve).toMatchObject({
      id: '233864', name: 'Kalaloch', agency: 'nps', kind: 'rec',
      target_date: '2026-07-04', lat: 47.6, lng: -124.4, done: false, sold_out: false,
    });
    expect(curve.started_at).toBe('2026-06-21T10:00:00.000Z');
    expect(curve.points).toEqual([{ ts: '2026-06-21T10:00:00.000Z', available: 8, reserved: 2, total: 10 }]);

    // It really landed in R2 at the documented key.
    const stored = (await (await RAW.get(watchKey('233864', '2026-07-04')))!.json()) as WatchCurve;
    expect(stored.points).toHaveLength(1);
  });

  test('read-modify-writes: appends to the existing series and keeps started_at', async () => {
    const RAW = makeR2();
    const env = { RAW } as unknown as WfEnv;
    await appendWatchPoint(env, WATCH_SITE, { ts: '2026-06-21T10:00:00.000Z', available: 8, reserved: 2, total: 10 }, false, false);
    const curve = await appendWatchPoint(
      env, WATCH_SITE,
      { ts: '2026-06-21T16:00:00.000Z', available: 0, reserved: 10, total: 10 },
      true, true,
    );
    expect(curve.started_at).toBe('2026-06-21T10:00:00.000Z'); // preserved from the first point
    expect(curve.updated_at).toBe('2026-06-21T16:00:00.000Z');
    expect(curve.done).toBe(true);
    expect(curve.sold_out).toBe(true);
    expect(curve.points.map((p) => p.reserved)).toEqual([2, 10]);
  });
});
