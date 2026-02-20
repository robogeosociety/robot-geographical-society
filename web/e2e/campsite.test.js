import { test, expect } from '@playwright/test';

const BASE_URL = 'http://localhost:5173';
const BACKEND_URL = 'http://localhost:8787';

test.describe('Robot Geographical Society - Integration', () => {
  test('backend should be reachable and return campsite data', async ({ request }) => {
    const response = await request.get(`${BACKEND_URL}/campsite/fishtrap-recreation-area`);
    expect(response.ok()).toBeTruthy();
    const data = await response.json();
    expect(data.name).toBe('Fishtrap Recreation Area');
    expect(data.agency_short).toBe('blm');
  });

  test('frontend should be reachable', async ({ page }) => {
    await page.goto(BASE_URL, { waitUntil: 'domcontentloaded' });
    const title = await page.title();
    expect(title).toBe('Robot Geographical Society');
  });
});
