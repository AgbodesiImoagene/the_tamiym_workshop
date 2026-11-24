import { expect, test } from '@playwright/test';
import { e2eUsers, urls } from '../fixtures/identities';
import { latestSignupCode } from '../fixtures/signup-code';

/**
 * TTW-254: a new sign-up in apps/app is confirmed with a 6-digit code emailed to the address. No
 * account and no session exist until the code is entered; a wrong code is refused on the same
 * screen; the right one creates the verified account and opens the dashboard.
 *
 * The test reads the code from the queued mail job (see `latestSignupCode`): e2e cannot read an
 * inbox. The API's own rules (attempt cap, cooldown, rate limits, concurrency) are covered by
 * `apps/api/test/signup-email-code.e2e-spec.ts` against real Postgres and Redis.
 */
test.describe('Sign-up confirmed by an emailed code @comprehensive @app', () => {
  test('wrong code is refused, the right code creates the account and signs in', async ({
    browser,
  }) => {
    const context = await browser.newContext({
      baseURL: urls.app,
      storageState: { cookies: [], origins: [] },
    });
    const page = await context.newPage();
    try {
      const email = `signup.code.${Date.now()}@tamiym.test`;
      await page.goto('/auth/register');
      await page.getByLabel('Email address').fill(email);
      await page.getByLabel('First name').fill('Code');
      await page.getByLabel('Last name').fill('Tester');
      await page.getByLabel('Password', { exact: true }).fill(e2eUsers.customer.password);
      await page.getByRole('button', { name: 'Send confirmation code' }).click();

      // The code screen, not the dashboard: nobody is signed in yet.
      await expect(page.getByLabel('Confirmation code')).toBeVisible();
      await expect(page.getByText(email)).toBeVisible();
      await expect(page).toHaveURL(/\/auth\/register/);
      await expect(page.getByRole('button', { name: /resend code/i })).toBeDisabled();

      const code = await latestSignupCode(email);
      const wrong = code === '000000' ? '000001' : '000000';

      await page.getByLabel('Confirmation code').fill(wrong);
      await page.getByRole('button', { name: 'Confirm and sign in' }).click();
      // Next.js adds its own route announcer with role=alert: pick ours by its text.
      await expect(
        page.getByRole('alert').filter({ hasText: /invalid or has expired/i })
      ).toBeVisible();
      await expect(page).toHaveURL(/\/auth\/register/);

      await page.getByLabel('Confirmation code').fill(code);
      await page.getByRole('button', { name: 'Confirm and sign in' }).click();
      await expect(page).toHaveURL(/\/dashboard/);

      // Confirmed by the code, so the unverified-email banner never shows.
      await expect(page.getByRole('status').filter({ hasText: /verify your email/i })).toHaveCount(
        0
      );
    } finally {
      await context.close();
    }
  });
});
