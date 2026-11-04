import type { Page } from '@playwright/test';
import { createApiContext } from '../fixtures/api';
import { E2E_CAMPAIGN_SLUG_ACTIVE } from '../fixtures/seed-data';
import { expect, test, urls } from '../fixtures/test';

/**
 * TTW-009 — the fundraiser checkout reads the browser cart once the session is
 * known and checks it against the campaign of the page. The cart is written
 * directly to localStorage so the test does not depend on a sellable offer
 * (TTW-039 owns the full add-to-cart journey).
 */
const CART_KEY = 'ttw.web.campaign-cart.v1';
const checkoutUrl = `${urls.web}/fundraiser/${E2E_CAMPAIGN_SLUG_ACTIVE}/checkout`;

async function activeCampaign(): Promise<{ id: string; title: string }> {
  const api = await createApiContext();
  try {
    const response = await api.get(`public/fundraisers/${E2E_CAMPAIGN_SLUG_ACTIVE}`);
    expect(response.ok(), 'seeded active fundraiser').toBeTruthy();
    return (await response.json()) as { id: string; title: string };
  } finally {
    await api.dispose();
  }
}

async function storeCart(page: Page, campaignId: string | null) {
  await page.goto(`${urls.web}/`);
  await page.evaluate(
    ([key, id]) => {
      if (!id) {
        window.localStorage.removeItem(key);
        return;
      }
      window.localStorage.setItem(
        key,
        JSON.stringify({
          schemaVersion: 1,
          campaignId: id,
          lines: [
            {
              campaignProductId: 'e2e-campaign-product',
              productId: 'e2e-product',
              variantId: 'e2e-variant-1234',
              designId: 'e2e-design',
              quantity: 2,
            },
          ],
          idempotencyKey: 'ttw-009-e2e-key',
          pendingOrderId: null,
          updatedAt: new Date().toISOString(),
        })
      );
    },
    [CART_KEY, campaignId] as const
  );
}

test.describe('Fundraiser checkout cart @comprehensive @web', () => {
  test('shows the cart of the matching campaign', async ({ customerPage }) => {
    const campaign = await activeCampaign();
    await storeCart(customerPage, campaign.id);

    await customerPage.goto(checkoutUrl);

    await expect(customerPage.getByRole('heading', { level: 1 })).toHaveText(campaign.title);
    await expect(customerPage.getByText('2 items · campaign-scoped · ids only')).toBeVisible();
    await expect(customerPage.getByText(/does not match the campaign/)).toHaveCount(0);
  });

  test('flags a cart from another campaign and lets the supporter discard it', async ({
    customerPage,
  }) => {
    await storeCart(customerPage, 'another-campaign-id');

    await customerPage.goto(checkoutUrl);

    await expect(
      customerPage.getByText('This checkout page does not match the campaign in your cart.')
    ).toBeVisible();
    await customerPage.getByRole('button', { name: 'Discard cart' }).click();
    await expect(customerPage).toHaveURL(`${urls.web}/fundraiser/${E2E_CAMPAIGN_SLUG_ACTIVE}`);
    expect(await customerPage.evaluate((key) => window.localStorage.getItem(key), CART_KEY)).toBe(
      null
    );
  });

  test('explains that an empty cart cannot be checked out', async ({ customerPage }) => {
    await storeCart(customerPage, null);

    await customerPage.goto(checkoutUrl);

    await expect(
      customerPage.getByText('Your cart is empty. Choose a product on the fundraiser page first.')
    ).toBeVisible();
    await expect(customerPage.getByRole('button', { name: 'Discard cart' })).toHaveCount(0);
  });
});
