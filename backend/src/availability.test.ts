import { expect, test, describe, vi, afterEach } from 'vitest';
import { fetchRecAvailability, fetchWaAvailability } from './availability';

// A single-month rec.gov availability payload, two sites, mixed statuses.
const REC_PAYLOAD = {
  campsites: {
    '111': {
      campsite_id: '111',
      site: 'A001',
      loop: 'Loop A',
      campsite_type: 'STANDARD NONELECTRIC',
      type_of_use: 'Overnight',
      availabilities: {
        '2026-06-15T00:00:00Z': 'Available',
        '2026-06-16T00:00:00Z': 'Reserved',
      },
    },
    '222': {
      campsite_id: '222',
      site: 'A002',
      loop: 'Loop A',
      campsite_type: 'TENT ONLY',
      type_of_use: 'Overnight',
      availabilities: {
        '2026-06-15T00:00:00Z': 'Reserved',
        '2026-06-16T00:00:00Z': 'Not Reservable',
      },
    },
  },
};

afterEach(() => vi.unstubAllGlobals());

describe('fetchRecAvailability per-site collection', () => {
  test('preserves per-campsite identity and status', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => REC_PAYLOAD }));

    const { bySite } = await fetchRecAvailability('123', 1, new Date('2026-06-01T00:00:00Z'));

    expect(Object.keys(bySite).sort()).toEqual(['111', '222']);
    expect(bySite['111']).toMatchObject({ label: 'A001', loop: 'Loop A', type: 'STANDARD NONELECTRIC', use: 'Overnight' });
    expect(bySite['111'].by_date).toEqual({ '2026-06-15': 'available', '2026-06-16': 'reserved' });
    // Unknown statuses normalize to "other", not silently dropped.
    expect(bySite['222'].by_date).toEqual({ '2026-06-15': 'reserved', '2026-06-16': 'other' });
  });

  test('aggregate counts equal the derived per-site sum (no drift)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => REC_PAYLOAD }));

    const { by, bySite } = await fetchRecAvailability('123', 1, new Date('2026-06-01T00:00:00Z'));

    // Recompute the aggregate straight from bySite and assert it matches `by`.
    const derived: Record<string, { available: number; reserved: number; total: number }> = {};
    for (const site of Object.values(bySite)) {
      for (const [day, status] of Object.entries(site.by_date)) {
        const c = (derived[day] ??= { available: 0, reserved: 0, total: 0 });
        if (status === 'available') c.available++;
        else if (status === 'reserved') c.reserved++;
        c.total++;
      }
    }
    expect(by).toEqual(derived);
    expect(by['2026-06-15']).toEqual({ available: 1, reserved: 1, total: 2 });
    expect(by['2026-06-16']).toEqual({ available: 0, reserved: 1, total: 2 });
  });
});

describe('fetchWaAvailability daily granularity + labels', () => {
  test('produces per-night statuses keyed by date, with resolved site labels', async () => {
    const fetchMock = vi.fn(async (url: string) => {
      let body: unknown = {};
      if (url.includes('/api/maps?')) body = [{ mapId: 111 }];
      else if (url.includes('/api/resourcelocation/resources')) body = { r1: { localizedValues: [{ name: 'A01' }] } };
      else if (url.includes('/api/availability/map'))
        // codes: 0=available, 1=reserved, 3=other → three consecutive nights
        body = { resourceAvailabilities: { r1: [{ availability: 0 }, { availability: 1 }, { availability: 3 }] } };
      return { ok: true, json: async () => body };
    });
    vi.stubGlobal('fetch', fetchMock);

    const { by, bySite } = await fetchWaAvailability(-123, 1, new Date('2026-07-01T00:00:00Z'));

    // Label resolved from /api/resourcelocation/resources.
    expect(bySite['r1'].label).toBe('A01');
    // Daily (not monthly) per-night statuses, one key per night.
    expect(bySite['r1'].by_date).toEqual({
      '2026-07-01': 'available',
      '2026-07-02': 'reserved',
      '2026-07-03': 'other',
    });
    // Aggregate derived per day from per-site.
    expect(by['2026-07-01']).toEqual({ available: 1, reserved: 0, total: 1 });
    expect(by['2026-07-02']).toEqual({ available: 0, reserved: 1, total: 1 });
    // Must request the daily-grid endpoint.
    expect(fetchMock.mock.calls.some(([u]) => String(u).includes('getDailyAvailability=true'))).toBe(true);
  });
});
