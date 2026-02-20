import { test, expect } from '@playwright/test';

const BASE_URL = 'http://127.0.0.1:5173';
const BACKEND_URL = 'http://127.0.0.1:8787';

test.describe('Robot Geographical Society - Integration', () => {
  test('backend should be reachable and return campsite data', async ({ request }) => {
    // Retry logic for backend readiness
    let response;
    for (let i = 0; i < 5; i++) {
        try {
            response = await request.get(`${BACKEND_URL}/campsite/fishtrap-recreation-area`);
            if (response.ok()) break;
        } catch (e) {
            console.log(`Backend attempt ${i+1} failed: ${e.message}`);
        }
        await new Promise(r => setTimeout(r, 2000));
    }
    
    expect(response?.ok()).toBeTruthy();
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
