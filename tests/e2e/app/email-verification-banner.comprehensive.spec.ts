import { expect, test } from '@playwright/test';
import { e2eUsers, urls } from '../fixtures/identities';

/**
 * TTW-090: a customer who just signed up is told the email must be verified before ordering,
 * and can ask for a new link. The test registers its own customer through the sign-up form.
 * Reading the link from the inbox is not possible in e2e, so "verify, then order" is covered
 * by the API integration tests and the component tests, not here.
 */
test.describe('Unverified email banner @comprehensive @app', () => {
  test('sign up, see the verification message, resend the link', async ({ browser }) => {
    const context = await browser.newContext({
      baseURL: urls.app,
      storageState: { cookies: [], origins: [] },
    });
    const page = await context.newPage();
    try {
      await page.goto('/auth/register');
      await page.getByLabel('Email address').fill(`verify.banner.${Date.now()}@tamiym.test`);
      await page.getByLabel('First name').fill('Verify');
      await page.getByLabel('Last name').fill('Banner');
      await page.getByLabel('Password', { exact: true }).fill(e2eUsers.customer.password);
      await page.getByRole('button', { name: /create account|sign up|register/i }).click();

      await expect(page).toHaveURL(/\/dashboard/);
      const banner = page.getByRole('status').filter({ hasText: /verify your email/i });
      await expect(banner).toBeVisible();

      const resent = page.waitForResponse(
        (r) => r.url().endsWith('/v1/auth/resend-verification') && r.request().method() === 'POST'
      );
      await banner.getByRole('button', { name: 'Resend link' }).click();
      expect((await resent).status()).toBe(200);
      await expect(banner.getByText(/we sent a new link/i)).toBeVisible();
    } finally {
      await context.close();
    }
  });
});
