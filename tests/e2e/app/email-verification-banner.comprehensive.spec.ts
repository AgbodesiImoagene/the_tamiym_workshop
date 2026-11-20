import { expect, test } from '@playwright/test';
import { e2eUnverifiedCustomers, e2eUsers, urls } from '../fixtures/identities';
import { paystackSimulator } from '../fixtures/paystack-simulator';

/**
 * TTW-090: a customer who just signed up is told the email must be verified before ordering,
 * and can ask for a new link. The test registers its own customer through the sign-up form.
 *
 * The second test plays "verify, then order". The API keeps only the sha256 of a verification
 * token and e2e cannot read an inbox, so seed:e2e writes a known token for one unverified
 * customer per attempt (see `e2eUnverifiedCustomers`).
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

  test('refused at checkout until the email is verified, then the order goes through', async ({
    browser,
  }, testInfo) => {
    const customer = e2eUnverifiedCustomers[testInfo.retry];
    expect(customer, 'one seeded unverified customer per attempt').toBeDefined();
    const context = await browser.newContext({
      baseURL: urls.app,
      storageState: { cookies: [], origins: [] },
    });
    const page = await context.newPage();
    try {
      await page.route('**/v1/orders/*/initiate-payment', async (route) => {
        const id = route.request().url().split('/orders/')[1].split('/')[0];
        const session = paystackSimulator.initializeTransaction(`ord-${id}`);
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ ...session, attemptOutcome: session.outcome }),
        });
      });
      await page.route('https://checkout.paystack.test/**', (route) =>
        route.fulfill({ status: 200, contentType: 'text/html', body: '<h1>Paystack test</h1>' })
      );

      await page.goto('/auth/login');
      await page.getByLabel('Email address').fill(customer.email);
      await page.getByLabel('Password', { exact: true }).fill(customer.password);
      await page.getByRole('button', { name: 'Sign in' }).click();
      await expect(page).toHaveURL(/\/dashboard/);
      const banner = page.getByRole('status').filter({ hasText: /verify your email/i });
      await expect(banner).toBeVisible();

      await page.goto('/dashboard/products/e2e-product-campus-hoodie');
      await page.getByLabel('Quantity for Small').fill('1');
      await page.getByRole('button', { name: 'Add to cart' }).click();
      await expect(
        page.getByRole('status').filter({ hasText: /added to your cart/i })
      ).toBeVisible();

      // The API refuses the order: the checkout explains why and offers the resend.
      await page.goto('/dashboard/checkout');
      await expect(page.getByLabel('City')).toHaveValue('Ikeja');
      await page.getByRole('button', { name: 'Review quote' }).click();
      await page.getByRole('button', { name: 'Place order and pay' }).click();
      const refusal = page
        .getByRole('status')
        .filter({ hasText: /order has not been placed because your email is not verified/i });
      await expect(refusal).toBeVisible();
      await expect(refusal.getByRole('button', { name: 'Resend link' })).toBeEnabled();
      await expect(page).toHaveURL(/\/dashboard\/checkout/);

      // Verify with the seeded token, on the public site where the emailed link points.
      await page.goto(`${urls.web}/verify-email?token=${customer.verificationToken}&next=%2F`);
      await page.getByRole('button', { name: 'Verify email' }).click();
      await expect(page).toHaveURL(`${urls.web}/`);

      // Back in the app the banner is gone, and the same order now goes through.
      await page.goto('/dashboard/checkout');
      await expect(page.getByLabel('City')).toHaveValue('Ikeja');
      await expect(page.getByRole('status').filter({ hasText: /verify your email/i })).toHaveCount(
        0
      );
      await page.getByRole('button', { name: 'Review quote' }).click();
      await page.getByRole('button', { name: 'Place order and pay' }).click();
      await page.waitForURL(/checkout\.paystack\.test/);
    } finally {
      await context.close();
    }
  });
});
