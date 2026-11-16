import { test, expect } from '../fixtures/test';

// TTW-089: the customer app login links to the reset pages, which live on the public site.
test.describe('Customer app login recovery link @comprehensive @app', () => {
  test('"Forgot password?" opens the forgot-password page on the web site', async ({ browser }) => {
    const context = await browser.newContext({
      baseURL: process.env.PLAYWRIGHT_APP_URL ?? 'http://localhost:3002',
      storageState: { cookies: [], origins: [] },
    });
    const page = await context.newPage();
    try {
      await page.goto('/auth/login');
      const link = page.getByRole('link', { name: /Forgot password\?/i });
      await expect(link).toHaveAttribute('href', /\/auth\/forgot-password$/);

      await link.click();
      await expect(page).toHaveURL(/\/auth\/forgot-password$/);
      await expect(page.getByText('Reset your password', { exact: true })).toBeVisible();
      await expect(page.getByRole('button', { name: 'Send reset link' })).toBeVisible();
    } finally {
      await context.close();
    }
  });
});
