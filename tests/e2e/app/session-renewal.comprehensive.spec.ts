import { expect } from '@playwright/test';
import { test, attachStrictPageGuards, urls } from '../fixtures/test';
import { apiLogin, createApiContext } from '../fixtures/api';
import { e2eUsers } from '../fixtures/identities';
import { navigateCustomerSidebarLink } from '../fixtures/interactions';

const ACCESS_COOKIE = 'ttw_customer_access';
const REFRESH_COOKIE = 'ttw_customer_refresh';

/**
 * TTW-262: the customer app renews its session when the 15-minute access cookie is gone,
 * instead of sending the person to the login page.
 *
 * These tests sign in on their own session (a second login of the shared customer): a refresh
 * rotates the refresh token, and the saved `customer` state used by the other specs must keep
 * working. On localhost the CSRF cookie is readable and shared, so this cannot show the
 * production 403 of a new tab (the unit test with no stored token and the API tests do).
 */
test.describe('Customer session renewal @comprehensive @app', () => {
  async function ownSession(browser: import('@playwright/test').Browser) {
    const api = await createApiContext('CUSTOMER');
    await apiLogin(api, e2eUsers.customer.email, e2eUsers.customer.password, 'CUSTOMER');
    const storageState = await api.storageState();
    await api.dispose();
    return browser.newContext({ baseURL: urls.app, storageState });
  }

  test('an expired access cookie is renewed once and the person stays signed in', async ({
    browser,
  }) => {
    const context = await ownSession(browser);
    try {
      const page = await context.newPage();
      // Chromium logs the expected 401 of the first request as a console error.
      const assertClean = attachStrictPageGuards(page, {
        allowConsoleError: (message) => message.text().includes('status of 401'),
      });
      const apiCalls: string[] = [];
      page.on('request', (request) => {
        const { pathname } = new URL(request.url());
        if (pathname === '/v1/auth/csrf' || pathname === '/v1/auth/refresh') {
          apiCalls.push(`${request.method()} ${pathname}`);
        }
      });

      await page.goto('/dashboard');
      await expect(page.getByRole('heading', { name: /Welcome To Your Workshop/i })).toBeVisible();

      // The access cookie expires; the refresh cookie (7 days) is still there.
      await context.clearCookies({ name: ACCESS_COOKIE });

      const refreshed = page.waitForResponse(
        (response) => new URL(response.url()).pathname === '/v1/auth/refresh'
      );
      await navigateCustomerSidebarLink(page, 'Products', '/dashboard/products');
      expect((await refreshed).status()).toBe(200);
      await expect(page.getByRole('heading', { name: 'Product List', level: 1 })).toBeVisible();
      await expect(page).toHaveURL(/\/dashboard\/products/);
      await expect(page).not.toHaveURL(/\/auth\/login/);

      expect(apiCalls).toEqual(['GET /v1/auth/csrf', 'POST /v1/auth/refresh']);
      const names = (await context.cookies()).map((cookie) => cookie.name);
      expect(names).toContain(ACCESS_COOKIE);
      assertClean();
    } finally {
      await context.close();
    }
  });

  test('without any session cookie the person lands on the login page, with no loop', async ({
    browser,
  }) => {
    const context = await ownSession(browser);
    try {
      const page = await context.newPage();
      const assertClean = attachStrictPageGuards(page, {
        allowConsoleError: (message) => message.text().includes('status of 401'),
      });
      let refreshCalls = 0;
      let csrfCalls = 0;
      page.on('request', (request) => {
        const { pathname } = new URL(request.url());
        if (pathname === '/v1/auth/refresh') refreshCalls += 1;
        if (pathname === '/v1/auth/csrf') csrfCalls += 1;
      });

      await page.goto('/dashboard');
      await expect(page.getByRole('heading', { name: /Welcome To Your Workshop/i })).toBeVisible();

      await context.clearCookies({ name: ACCESS_COOKIE });
      await context.clearCookies({ name: REFRESH_COOKIE });

      // A full page load, not a sidebar click: the signed-in user is cached for a minute, so a
      // click inside the page would not ask the API again and nothing would answer 401.
      await page.goto('/dashboard/products');
      await expect(page).toHaveURL(/\/auth\/login/);
      await page.waitForTimeout(500);
      expect(refreshCalls).toBe(0);
      expect(csrfCalls).toBeLessThanOrEqual(2);
      assertClean();
    } finally {
      await context.close();
    }
  });
});
