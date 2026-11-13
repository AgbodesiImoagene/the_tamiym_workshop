import path from 'node:path';
import { addClassicTeeToCart } from '../fixtures/cart';
import { authDir, expect, test, urls, attachStrictPageGuards } from '../fixtures/test';

/**
 * TTW-086 — an address outside every shipping zone is refused with a clear
 * message instead of a ₦0 delivery fee, the cart survives, and a covered
 * address quotes again.
 *
 * Quotes hit the real API. seed:e2e has a single zone (Lagos, ₦2,000) and
 * also seeds the FCT state, which no zone covers. The organiser account is used
 * because checkout saves the form as the primary address, and the customer
 * account's address is shared with checkout-idempotency.spec.ts, which runs
 * in parallel.
 *
 * The refused quote is a deliberate 400, which Chromium logs as a console
 * error. The strict guard tolerates that one line for POST /v1/orders/quote
 * only; any other console error still fails the test.
 */
const REFUSAL =
  "We don't deliver to this address yet. Check the state and LGA, or use another delivery address. Your cart is saved.";

test.describe('Checkout shipping coverage @app @journey', () => {
  test('refuses an uncovered state, keeps the cart, then quotes a covered state', async ({
    browser,
  }) => {
    const context = await browser.newContext({
      baseURL: urls.app,
      storageState: path.join(authDir, 'organiser.json'),
    });
    try {
      const page = await context.newPage();
      const assertClean = attachStrictPageGuards(page, {
        allowConsoleError: (message) =>
          message.text().includes('status of 400') &&
          /\/v1\/orders\/quote$/.test(message.location().url),
      });

      const quoteStatuses: number[] = [];
      page.on('response', (response) => {
        if (response.request().method() === 'POST' && /\/v1\/orders\/quote$/.test(response.url())) {
          quoteStatuses.push(response.status());
        }
      });
      const refusal = page.getByRole('alert').filter({ hasText: REFUSAL });

      // The page prefills the form once the saved addresses load; typing before
      // that would be overwritten.
      async function openCheckout() {
        const addressesLoaded = page.waitForResponse(
          (response) =>
            response.request().method() === 'GET' && /\/v1\/users\/addresses$/.test(response.url())
        );
        await page.goto('/dashboard/checkout');
        const saved = (await (await addressesLoaded).json()) as unknown[];
        if (saved.length > 0) {
          await expect(page.getByText(/saved address\(es\) found/)).toBeVisible();
        }
      }

      await addClassicTeeToCart(page);

      await openCheckout();
      await page.getByLabel('Recipient Name').fill('Coverage Tester');
      await page.getByLabel('Phone').fill('+2348012345678');
      await page.getByLabel('Street Address').fill('1 Coverage Street');
      await page.getByLabel('City').fill('Abuja');
      // TTW-087: the state is chosen from our list, so it cannot be misspelled.
      await expect(page.getByLabel('State')).not.toHaveJSProperty('tagName', 'INPUT');
      await page.getByLabel('State').selectOption({ label: 'Abuja Federal Capital Territory' });
      await page.getByRole('button', { name: 'Review quote' }).click();

      await expect(refusal).toBeVisible();
      await expect(page.getByText('Quote first')).toHaveCount(2);
      await expect(page.getByRole('button', { name: 'Place order and pay' })).toBeDisabled();
      expect(quoteStatuses).toEqual([400]);

      await page.goto('/dashboard/cart');
      await expect(page.getByRole('heading', { name: 'Classic Tee' })).toBeVisible();

      await openCheckout();
      await page.getByLabel('City').fill('Ikeja');
      await page.getByLabel('State').selectOption({ label: 'Lagos' });
      await page.getByLabel('LGA').selectOption({ label: 'Ikeja' });
      await page.getByRole('button', { name: 'Review quote' }).click();

      await expect(page.getByRole('button', { name: 'Place order and pay' })).toBeEnabled();
      await expect(refusal).toHaveCount(0);
      await expect(page.getByText('Quote first')).toHaveCount(0);
      expect(quoteStatuses).toEqual([400, 200]);

      assertClean();
    } finally {
      await context.close();
    }
  });
});
