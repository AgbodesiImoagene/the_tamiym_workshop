import { test, expect, urls } from '../fixtures/test';

test.describe('Anonymous web smoke @smoke @web', () => {
  test('API health is ok', async ({ request }) => {
    const res = await request.get(`${urls.api}/v1/health`);
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    expect(body.status).toBe('ok');
  });

  test('home page renders marketing hero', async ({ page }) => {
    await page.goto('/');
    await expect(
      page.getByRole('heading', { name: /Printing Your Vision, Perfectly!/i })
    ).toBeVisible();
  });

  test('fundraiser listing renders', async ({ page }) => {
    await page.goto('/fundraiser');
    await expect(
      page.getByRole('heading', { name: /Raise funds with custom merch/i })
    ).toBeVisible();
  });
});
