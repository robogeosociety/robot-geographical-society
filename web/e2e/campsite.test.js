import { test, expect } from '@playwright/test';

const BASE_URL = process.env.E2E_BASE_URL || 'http://127.0.0.1:5173';
// Reach the backend the way the app does: through the same-origin `/api` proxy on
// the Vite dev server, which attaches the Cloudflare Access service token
// (CF_ACCESS_CLIENT_ID/SECRET, set in CI) and forwards to the backend. This
// exercises the authenticated path end-to-end instead of hitting :8787 directly.
const API_URL = `${BASE_URL}/api`;

test.describe('Robot Geographical Society - Integration', () => {
  test('backend is reachable through the authenticated /api proxy', async ({ request }) => {
    // Probe /collectors — the path the app actually uses. It reads the bundled
    // inventory (so it returns rows even with empty R2), which makes this a clean
    // auth-path check independent of seeded availability snapshots.
    let response;
    for (let i = 0; i < 5; i++) {
      try {
        response = await request.get(`${API_URL}/collectors`);
        if (response.ok()) break;
      } catch (e) {
        console.log(`Proxy attempt ${i + 1} failed: ${e.message}`);
      }
      await new Promise((r) => setTimeout(r, 2000));
    }
    expect(response?.ok()).toBeTruthy();
    const data = await response.json();
    expect(Array.isArray(data)).toBe(true);
    expect(data.length).toBeGreaterThan(0);
    expect(data[0]).toHaveProperty('guid');
    expect(data[0]).toHaveProperty('state');
  });

  test('frontend loads and redirects to the availability view', async ({ page }) => {
    await page.goto(BASE_URL, { waitUntil: 'domcontentloaded' });
    expect(await page.title()).toBe('Robot Geographical Society');
    await expect(page).toHaveURL(/\/availability$/);
  });

  test('the top nav shows all view tabs', async ({ page }) => {
    await page.goto(`${BASE_URL}/availability`, { waitUntil: 'domcontentloaded' });
    await expect(page.getByRole('link', { name: /Availability/i })).toBeVisible();
    await expect(page.getByRole('link', { name: /Demand/i })).toBeVisible();
    await expect(page.getByRole('link', { name: /Collectors/i })).toBeVisible();
  });

  test('demand view renders the demand panel', async ({ page }) => {
    await page.goto(`${BASE_URL}/demand`, { waitUntil: 'domcontentloaded' });
    await expect(page.getByRole('heading', { name: 'Demand' })).toBeVisible();
  });

  test('availability view renders the map controls and agency legend', async ({ page }) => {
    await page.goto(`${BASE_URL}/availability`, { waitUntil: 'domcontentloaded' });
    await expect(page.locator('.map-overlay-tl')).toBeVisible();
    await expect(page.locator('.map-container')).toBeVisible();
    await expect(page.getByText('WA State Parks')).toBeVisible();
  });

  test('collectors view renders the fleet health panel', async ({ page }) => {
    await page.goto(`${BASE_URL}/collectors`, { waitUntil: 'domcontentloaded' });
    await expect(page.getByText('Fleet health')).toBeVisible();
  });

  test('clicking a nav tab switches the route', async ({ page }) => {
    await page.goto(`${BASE_URL}/availability`, { waitUntil: 'domcontentloaded' });
    await page.getByRole('link', { name: /Collectors/i }).click();
    await expect(page).toHaveURL(/\/collectors$/);
    await expect(page.getByText('Fleet health')).toBeVisible();
  });
});
