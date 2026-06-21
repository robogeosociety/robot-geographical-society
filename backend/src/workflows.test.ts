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

import { collectSite, type WfEnv } from './workflows';

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
