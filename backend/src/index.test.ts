import { expect, test, describe, vi } from 'vitest';
import { app } from './index';

describe('Hono API Tests', () => {
  test('GET / should return success message', async () => {
    const res = await app.request('/');
    expect(res.status).toBe(200);
    expect(await res.text()).toBe('Robot Geographical Society Backend API');
  });

  test('GET /campsite/:id should return 404 if not found', async () => {
    // Mock KV namespace
    const MOCK_CAMPSITES = {
      get: vi.fn().mockResolvedValue(null),
    };

    const res = await app.request('/campsite/non-existent', {}, {
      CAMPSITES: MOCK_CAMPSITES,
    } as any);

    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body).toEqual({ error: 'Campsite not found' });
  });

  test('GET /campsite/:id matches agency-prefixed (slash-containing) ids', async () => {
    const mockCampsite = { id: 'blm/fishtrap-recreation-area', name: 'Fishtrap Recreation Area', agency_short: 'blm' };
    const MOCK_CAMPSITES = { get: vi.fn().mockResolvedValue(mockCampsite) };

    const res = await app.request('/campsite/blm/fishtrap-recreation-area', {}, {
      CAMPSITES: MOCK_CAMPSITES,
    } as any);

    expect(res.status).toBe(200);
    // The full agency/slug path, not just the last segment, is used as the KV key.
    expect(MOCK_CAMPSITES.get).toHaveBeenCalledWith('blm/fishtrap-recreation-area', { type: 'json' });
    expect(await res.json()).toEqual(mockCampsite);
  });

  test('GET /campsite/:id should return campsite if found', async () => {
    const mockCampsite = {
      id: 'test-camp',
      name: 'Test Campground',
      agency: 'Test Agency',
    };

    const MOCK_CAMPSITES = {
      get: vi.fn().mockResolvedValue(mockCampsite),
    };

    const res = await app.request('/campsite/test-camp', {}, {
      CAMPSITES: MOCK_CAMPSITES,
    } as any);

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual(mockCampsite);
  });
});
