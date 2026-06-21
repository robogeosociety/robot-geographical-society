import { expect, test, describe, vi } from 'vitest';

// Mock the availability fetch so collectSite() gets a deterministic aggregate
// (the network + R2 paths are exercised elsewhere; here we assert the AE writes).
vi.mock('./availability', () => ({
  fetchAvailability: vi.fn(async () => ({
    raw: { ok: true },
    by: {
      // intentionally out of order to prove the soonest-first sort
      '2026-07-02': { available: 0, reserved: 4, total: 4 },
      '2026-07-01': { available: 3, reserved: 1, total: 4 },
    },
    bySite: {},
  })),
}));

import { collectSite, type WfEnv } from './workflows';

function spyEnv() {
  const demand: Array<{ indexes: string[]; blobs: string[]; doubles: number[] }> = [];
  const env = {
    RAW: { put: vi.fn(async () => undefined) },
    COLLECTOR_AE: { writeDataPoint: vi.fn() },
    AVAIL_AE: { writeDataPoint: vi.fn() },
    DEMAND_AE: { writeDataPoint: vi.fn((p: { indexes: string[]; blobs: string[]; doubles: number[] }) => demand.push(p)) },
  } as unknown as WfEnv;
  return { env, demand };
}

const SITE = { id: '233864', name: 'Kalaloch', agency: 'nps', kind: 'rec', ref: '233864' } as never;

describe('collectSite → campsite_demand', () => {
  test('writes one demand row per target night, soonest-first, with the per-night schema', async () => {
    const { env, demand } = spyEnv();
    await collectSite(env, SITE, '2026-06-20');
    expect(demand).toEqual([
      { indexes: ['233864'], blobs: ['2026-07-01', 'nps', 'Kalaloch'], doubles: [3, 1, 4] },
      { indexes: ['233864'], blobs: ['2026-07-02', 'nps', 'Kalaloch'], doubles: [0, 4, 4] },
    ]);
  });

  test('caps at 240 nights so collectSite stays under the AE 250-writes/invocation limit', async () => {
    const big: Record<string, { available: number; reserved: number; total: number }> = {};
    for (let i = 1; i <= 300; i++) big[`2026-${String(i).padStart(4, '0')}`] = { available: 1, reserved: 0, total: 1 };
    const mod = await import('./availability');
    (mod.fetchAvailability as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ raw: {}, by: big, bySite: {} });

    const { env, demand } = spyEnv();
    await collectSite(env, SITE, '2026-06-20');

    expect(demand.length).toBe(240); // 300 nights → capped at 240
    expect(demand[0].blobs[0]).toBe('2026-0001'); // soonest-first
    expect(demand[239].blobs[0]).toBe('2026-0240'); // farthest 60 dropped
  });
});
