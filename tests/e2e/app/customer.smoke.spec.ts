import { test, expect } from '../fixtures/test';

test.describe('Customer app smoke @smoke @app', () => {
  test('public landing shows customer app shell', async ({ browser }) => {
    const context = await browser.newContext({
      baseURL: process.env.PLAYWRIGHT_APP_URL ?? 'http://localhost:3002',
    });
    const page = await context.newPage();
    await page.goto('/');
    await expect(page.getByText(/Customer app/i).first()).toBeVisible();
    await expect(page.getByRole('link', { name: /Sign in/i }).first()).toBeVisible();
    await context.close();
  });

  test('customer storage reaches dashboard', async ({ customerPage }) => {
    await customerPage.goto('/dashboard');
    await expect(
      customerPage.getByRole('heading', { name: /Welcome To Your Workshop/i })
    ).toBeVisible();
  });

  test('organiser storage reaches dashboard', async ({ organiserPage }) => {
    await organiserPage.goto('/dashboard');
    await expect(
      organiserPage.getByRole('heading', { name: /Welcome To Your Workshop/i })
    ).toBeVisible();
  });
});
