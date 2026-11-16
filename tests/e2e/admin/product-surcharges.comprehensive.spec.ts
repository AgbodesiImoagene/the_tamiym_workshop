import { expect, type APIRequestContext, type Page } from '@playwright/test';
import { apiLogin, createApiContext } from '../fixtures/api';
import { e2eUsers } from '../fixtures/identities';
import { test } from '../fixtures/test';

/** Seeded by `pnpm --filter api seed:e2e` (apps/api/scripts/seed-e2e-dummy-data.ts). */
const TEE_PRODUCT_ID = 'e2e-product-classic-tee';
const TEE_WHITE_LARGE_VARIANT_ID = 'e2e-variant-tee-white-l';
const CUSTOMER_ADDRESS_ID = 'e2e-address-customer-main';

const LARGE_FIELD = 'Surcharge for Size Large';
const PRODUCT_URL = `/admin/catalog/products/${TEE_PRODUCT_ID}`;

interface QuotedItem {
  unitFinalPrice: number | string;
  pricingBreakdown: { optionValueUpcharge: number | string };
}

/** The customer's quote for one Large tee, read from the API as a shopper would. */
async function quoteLargeTee(customerApi: APIRequestContext, csrfToken: string) {
  const res = await customerApi.post('orders/quote', {
    headers: { 'x-csrf-token': csrfToken },
    data: {
      shippingAddressId: CUSTOMER_ADDRESS_ID,
      items: [{ variantId: TEE_WHITE_LARGE_VARIANT_ID, quantity: 1 }],
    },
  });
  expect(res.ok(), await res.text()).toBe(true);
  const body = (await res.json()) as { items: QuotedItem[] };
  return {
    unitFinalPrice: Number(body.items[0].unitFinalPrice),
    optionValueUpcharge: Number(body.items[0].pricingBreakdown.optionValueUpcharge),
  };
}

/** A retry must not trip over a surcharge an earlier attempt left behind. */
async function removeLeftoverSurcharge(page: Page) {
  const field = page.getByLabel(LARGE_FIELD);
  await expect(field).toBeVisible();
  if ((await field.inputValue()) !== '') {
    await field.locator('xpath=ancestor::form').getByRole('button', { name: 'Remove' }).click();
    await expect(field).toHaveValue('');
  }
}

test.describe('Admin size and print surcharges @comprehensive @admin', () => {
  // The tests share one product and one amount field, so they take turns.
  test.describe.configure({ mode: 'serial' });

  test('an admin sets a Large surcharge of ₦500 and the customer quote shows it', async ({
    adminPage,
  }) => {
    await adminPage.goto(PRODUCT_URL);
    await expect(adminPage.getByText('Size and print surcharges', { exact: true })).toBeVisible();
    await removeLeftoverSurcharge(adminPage);

    const customerApi = await createApiContext('CUSTOMER');
    try {
      const { csrfToken } = await apiLogin(
        customerApi,
        e2eUsers.customer.email,
        e2eUsers.customer.password,
        'CUSTOMER'
      );
      const before = await quoteLargeTee(customerApi, csrfToken);
      expect(before.optionValueUpcharge).toBe(0);

      const field = adminPage.getByLabel(LARGE_FIELD);
      const row = field.locator('xpath=ancestor::form');
      await field.fill('500');
      await row.getByRole('button', { name: 'Save' }).click();
      await expect(row.getByText('Saved.')).toBeVisible();
      await expect(row.getByText('Current: ₦500.00')).toBeVisible();

      // The amount is stored, not just shown: it survives a reload.
      await adminPage.reload();
      await expect(adminPage.getByLabel(LARGE_FIELD)).toHaveValue('500.00');

      const after = await quoteLargeTee(customerApi, csrfToken);
      expect(after.optionValueUpcharge).toBe(500);
      expect(after.unitFinalPrice).toBe(before.unitFinalPrice + 500);

      // Removing it puts the quote back to what it was.
      await adminPage
        .getByLabel(LARGE_FIELD)
        .locator('xpath=ancestor::form')
        .getByRole('button', { name: 'Remove' })
        .click();
      await expect(adminPage.getByLabel(LARGE_FIELD)).toHaveValue('');
      await expect(adminPage.getByText('No surcharge').first()).toBeVisible();
      expect(await quoteLargeTee(customerApi, csrfToken)).toEqual(before);
    } finally {
      await customerApi.dispose();
    }
  });

  test('sets and removes a print surcharge for the Front view', async ({ adminPage }) => {
    const field = adminPage.getByLabel('Print surcharge for Front');
    await adminPage.goto(PRODUCT_URL);
    await expect(field).toBeVisible();
    const row = field.locator('xpath=ancestor::form');
    if ((await field.inputValue()) !== '') {
      await row.getByRole('button', { name: 'Remove' }).click();
      await expect(field).toHaveValue('');
    }

    await field.fill('1000');
    await row.getByRole('button', { name: 'Save' }).click();
    await expect(row.getByText('Current: ₦1,000.00')).toBeVisible();

    await adminPage.reload();
    await expect(adminPage.getByLabel('Print surcharge for Front')).toHaveValue('1000.00');

    await adminPage
      .getByLabel('Print surcharge for Front')
      .locator('xpath=ancestor::form')
      .getByRole('button', { name: 'Remove' })
      .click();
    await expect(adminPage.getByLabel('Print surcharge for Front')).toHaveValue('');
  });

  test('explains an invalid amount and saves nothing', async ({ adminPage }) => {
    await adminPage.goto(PRODUCT_URL);
    await removeLeftoverSurcharge(adminPage);

    const field = adminPage.getByLabel(LARGE_FIELD);
    const row = field.locator('xpath=ancestor::form');

    await field.fill('10.123');
    await row.getByRole('button', { name: 'Save' }).click();
    await expect(row.getByRole('alert')).toContainText('at most 2 decimals');

    await field.fill('');
    await row.getByRole('button', { name: 'Save' }).click();
    await expect(row.getByRole('alert')).toContainText('Enter an amount');

    await adminPage.reload();
    await expect(adminPage.getByLabel(LARGE_FIELD)).toHaveValue('');
  });
});
