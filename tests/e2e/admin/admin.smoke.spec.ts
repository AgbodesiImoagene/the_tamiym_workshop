import { test, expect } from '../fixtures/test';

test.describe('Admin console smoke @smoke @admin', () => {
  test('public landing shows admin console', async ({ browser }) => {
    const context = await browser.newContext({
      baseURL: process.env.PLAYWRIGHT_ADMIN_URL ?? 'http://localhost:3003',
    });
    const page = await context.newPage();
    await page.goto('/');
    await expect(page.getByText(/Admin console/i).first()).toBeVisible();
    await expect(page.getByRole('link', { name: /Admin sign in/i }).first()).toBeVisible();
    await context.close();
  });

  test('admin storage reaches overview', async ({ adminPage }) => {
    await adminPage.goto('/admin');
    await expect(adminPage.getByText(/Operations overview/i).first()).toBeVisible();
    await expect(adminPage.getByText(/Signed in as/i).first()).toBeVisible();
  });
});
