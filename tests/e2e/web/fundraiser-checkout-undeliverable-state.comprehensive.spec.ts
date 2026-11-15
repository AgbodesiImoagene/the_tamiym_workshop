import path from 'node:path';
import { createApiContext } from '../fixtures/api';
import { E2E_CAMPAIGN_SLUG_ACTIVE } from '../fixtures/seed-data';
import { attachStrictPageGuards, authDir, expect, test, urls } from '../fixtures/test';

/**
 * TTW-217 — the fundraiser checkout tells a supporter whose saved address is in
 * a state we no longer deliver to that we do not deliver there, and does not let
 * them ask for a quote.
 *
 * Real API and database, no mocks. The seeded customer
 * `undeliverable.e2e@tamiym.test` owns one address in "E2E Dormant State", which
 * seed:e2e creates inactive. The API refusal of the fundraiser quote and order is
 * proven on real Postgres in apps/api/test/address-state-not-deliverable.e2e-spec.ts.
 * The cart is written straight to localStorage, as fundraiser-checkout.comprehensive.spec.ts
 * does; the ids are the seeded ones.
 */
const CART_KEY = 'ttw.web.campaign-cart.v1';
const checkoutUrl = `${urls.web}/fundraiser/${E2E_CAMPAIGN_SLUG_ACTIVE}/checkout`;
const MESSAGE = 'We do not deliver to this area.';

test.describe('Fundraiser checkout address in a deactivated state @comprehensive @web', () => {
  test('says we do not deliver there and blocks the quote', async ({ browser }) => {
    const api = await createApiContext();
    const campaignResponse = await api.get(`public/fundraisers/${E2E_CAMPAIGN_SLUG_ACTIVE}`);
    expect(campaignResponse.ok(), 'seeded active fundraiser').toBeTruthy();
    const campaign = (await campaignResponse.json()) as { id: string };
    await api.dispose();

    const context = await browser.newContext({
      baseURL: urls.web,
      storageState: path.join(authDir, 'customer-undeliverable.json'),
    });
    try {
      const page = await context.newPage();
      const assertClean = attachStrictPageGuards(page);
      const quoteRequests: string[] = [];
      page.on('request', (request) => {
        if (request.method() === 'POST' && /\/orders(\/quote)?$/.test(request.url())) {
          quoteRequests.push(request.url());
        }
      });

      await page.goto(`${urls.web}/`);
      await page.evaluate(
        ([key, id]) => {
          window.localStorage.setItem(
            key,
            JSON.stringify({
              schemaVersion: 1,
              campaignId: id,
              lines: [
                {
                  campaignProductId: 'e2e-campaign-product-campus-tee',
                  productId: 'e2e-product-classic-tee',
                  variantId: 'e2e-variant-tee-navy-m',
                  designId: 'e2e-design-pending-community-tee',
                  quantity: 1,
                },
              ],
              idempotencyKey: 'ttw-217-e2e-key',
              pendingOrderId: null,
              updatedAt: new Date().toISOString(),
            })
          );
        },
        [CART_KEY, campaign.id] as const
      );

      const addressesLoaded = page.waitForResponse(
        (response) =>
          response.request().method() === 'GET' && /\/users\/addresses$/.test(response.url())
      );
      await page.goto(checkoutUrl);
      const saved = (await (await addressesLoaded).json()) as Array<{ stateCode: string | null }>;
      expect(saved).toHaveLength(1);
      expect(saved[0].stateCode).toBe('ZZ');

      await expect(page.getByLabel('City')).toHaveValue('Ikeja');
      await expect(page.getByText(MESSAGE)).toBeVisible();
      await expect(page.getByText('Choose a state from the list.')).toHaveCount(0);
      await expect(page.getByLabel('State')).toHaveValue('');
      await expect(page.getByRole('button', { name: 'Review authoritative quote' })).toBeDisabled();
      expect(quoteRequests).toEqual([]);

      // The cart is untouched.
      expect(await page.evaluate((key) => window.localStorage.getItem(key), CART_KEY)).not.toBe(
        null
      );

      assertClean();
    } finally {
      await context.close();
    }
  });

  // The state is active, so the form lets the quote go: the refusal comes from
  // the real API, because the saved address is linked to a deactivated LGA.
  test('shows the API refusal for an address linked to a deactivated LGA', async ({ browser }) => {
    const api = await createApiContext();
    const campaignResponse = await api.get(`public/fundraisers/${E2E_CAMPAIGN_SLUG_ACTIVE}`);
    expect(campaignResponse.ok(), 'seeded active fundraiser').toBeTruthy();
    const campaign = (await campaignResponse.json()) as { id: string };
    await api.dispose();

    const context = await browser.newContext({
      baseURL: urls.web,
      storageState: path.join(authDir, 'customer-undeliverable-lga.json'),
    });
    try {
      const page = await context.newPage();
      const assertClean = attachStrictPageGuards(page, {
        allowConsoleError: (message) =>
          message.text().includes('status of 400') &&
          /\/orders\/quote$/.test(message.location().url),
      });
      const quotes: Array<{ status: number; code?: string }> = [];
      page.on('response', async (response) => {
        if (response.request().method() === 'POST' && /\/orders\/quote$/.test(response.url())) {
          const body = (await response.json().catch(() => ({}))) as { code?: string };
          quotes.push({ status: response.status(), code: body.code });
        }
      });

      await page.goto(`${urls.web}/`);
      await page.evaluate(
        ([key, id]) => {
          window.localStorage.setItem(
            key,
            JSON.stringify({
              schemaVersion: 1,
              campaignId: id,
              lines: [
                {
                  campaignProductId: 'e2e-campaign-product-campus-tee',
                  productId: 'e2e-product-classic-tee',
                  variantId: 'e2e-variant-tee-navy-m',
                  designId: 'e2e-design-pending-community-tee',
                  quantity: 1,
                },
              ],
              idempotencyKey: 'ttw-217-e2e-lga-key',
              pendingOrderId: null,
              updatedAt: new Date().toISOString(),
            })
          );
        },
        [CART_KEY, campaign.id] as const
      );

      await page.goto(checkoutUrl);
      await expect(page.getByLabel('City')).toHaveValue('Ikeja');
      await expect(page.getByLabel('State')).toHaveValue('LA');
      await page.getByRole('button', { name: 'Review authoritative quote' }).click();

      await expect(page.getByRole('alert').filter({ hasText: MESSAGE })).toBeVisible();
      expect(quotes).toEqual([{ status: 400, code: 'ADDRESS_STATE_NOT_DELIVERABLE' }]);
      expect(await page.evaluate((key) => window.localStorage.getItem(key), CART_KEY)).not.toBe(
        null
      );

      assertClean();
    } finally {
      await context.close();
    }
  });
});
