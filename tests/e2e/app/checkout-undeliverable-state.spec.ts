import path from 'node:path';
import { addClassicTeeToCart } from '../fixtures/cart';
import { authDir, expect, test, urls, attachStrictPageGuards } from '../fixtures/test';

/**
 * TTW-217 — a customer whose saved address is in a state we no longer deliver
 * to is told so in checkout, cannot ask for a quote or place an order, and keeps
 * the cart.
 *
 * Everything hits the real API and the real database. The seeded customer
 * `undeliverable.e2e@tamiym.test` owns one address saved in "E2E Dormant State",
 * which seed:e2e creates inactive (no admin route deactivates a state). The state
 * list the checkout offers only holds active states, so the saved state is not in
 * it and the form says we do not deliver there. The API refusal itself (quote and
 * order, standard and fundraiser) is proven on real Postgres in
 * apps/api/test/address-state-not-deliverable.e2e-spec.ts.
 */
const MESSAGE = 'We do not deliver to this area.';

test.describe('Checkout address in a deactivated state @app @journey', () => {
  test('says we do not deliver there, blocks the quote and the order, and keeps the cart', async ({
    browser,
  }) => {
    const context = await browser.newContext({
      baseURL: urls.app,
      storageState: path.join(authDir, 'customer-undeliverable.json'),
    });
    try {
      const page = await context.newPage();
      const assertClean = attachStrictPageGuards(page);
      const quoteRequests: string[] = [];
      page.on('request', (request) => {
        if (request.method() === 'POST' && /\/v1\/orders(\/quote)?$/.test(request.url())) {
          quoteRequests.push(request.url());
        }
      });

      await addClassicTeeToCart(page);

      const addressesLoaded = page.waitForResponse(
        (response) =>
          response.request().method() === 'GET' && /\/v1\/users\/addresses$/.test(response.url())
      );
      await page.goto('/dashboard/checkout');
      const saved = (await (await addressesLoaded).json()) as Array<{
        stateCode: string | null;
      }>;
      // The address really is in the deactivated state, read from the real API.
      expect(saved).toHaveLength(1);
      expect(saved[0].stateCode).toBe('ZZ');

      await expect(page.getByLabel('City')).toHaveValue('Ikeja');
      await expect(page.getByText(MESSAGE)).toBeVisible();
      await expect(page.getByText('Choose a state from the list.')).toHaveCount(0);
      await expect(page.getByLabel('State')).toHaveValue('');
      await expect(page.getByRole('button', { name: 'Review quote' })).toBeDisabled();
      await expect(page.getByRole('button', { name: 'Place order and pay' })).toBeDisabled();
      await expect(page.getByText('Quote first')).toHaveCount(2);

      // The refusal comes from the form, not from a request: nothing was sent.
      expect(quoteRequests).toEqual([]);

      // The cart is untouched.
      await page.goto('/dashboard/cart');
      await expect(page.getByRole('heading', { name: 'Classic Tee' })).toBeVisible();

      assertClean();
    } finally {
      await context.close();
    }
  });

  // The state is active, so the form lets the quote go: the refusal comes from
  // the real API, because the saved address is linked to a deactivated LGA.
  test('shows the API refusal for an address linked to a deactivated LGA and keeps the cart', async ({
    browser,
  }) => {
    const context = await browser.newContext({
      baseURL: urls.app,
      storageState: path.join(authDir, 'customer-undeliverable-lga.json'),
    });
    try {
      const page = await context.newPage();
      const assertClean = attachStrictPageGuards(page, {
        allowConsoleError: (message) =>
          message.text().includes('status of 400') &&
          /\/v1\/orders\/quote$/.test(message.location().url),
      });
      const quotes: Array<{ status: number; code?: string }> = [];
      const orderPosts: string[] = [];
      page.on('response', async (response) => {
        if (response.request().method() !== 'POST') return;
        if (/\/v1\/orders\/quote$/.test(response.url())) {
          const body = (await response.json().catch(() => ({}))) as { code?: string };
          quotes.push({ status: response.status(), code: body.code });
        } else if (/\/v1\/orders$/.test(response.url())) {
          orderPosts.push(response.url());
        }
      });

      await addClassicTeeToCart(page);
      const addressesLoaded = page.waitForResponse(
        (response) =>
          response.request().method() === 'GET' && /\/v1\/users\/addresses$/.test(response.url())
      );
      await page.goto('/dashboard/checkout');
      const saved = (await (await addressesLoaded).json()) as Array<{ lgaId: string | null }>;
      expect(saved).toHaveLength(1);
      expect(saved[0].lgaId).not.toBeNull();

      await expect(page.getByLabel('City')).toHaveValue('Ikeja');
      await expect(page.getByLabel('State')).toHaveValue('LA');
      await page.getByRole('button', { name: 'Review quote' }).click();

      await expect(page.getByRole('alert').filter({ hasText: MESSAGE })).toBeVisible();
      await expect(page.getByText('Quote first')).toHaveCount(2);
      await expect(page.getByRole('button', { name: 'Place order and pay' })).toBeDisabled();
      expect(quotes).toEqual([{ status: 400, code: 'ADDRESS_STATE_NOT_DELIVERABLE' }]);
      expect(orderPosts).toEqual([]);

      await page.goto('/dashboard/cart');
      await expect(page.getByRole('heading', { name: 'Classic Tee' })).toBeVisible();

      assertClean();
    } finally {
      await context.close();
    }
  });
});
