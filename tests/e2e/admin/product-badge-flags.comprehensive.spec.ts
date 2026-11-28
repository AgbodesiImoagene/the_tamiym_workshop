import { expect, type Page } from '@playwright/test';
import { createApiContext } from '../fixtures/api';
import { test } from '../fixtures/test';

/**
 * Seeded by `pnpm --filter api seed:e2e`. A pagination fixture no other spec reads the
 * flags of, so turning them on here cannot disturb the customer catalogue specs.
 */
const PRODUCT_ID = 'e2e-product-bulk-22';
const PRODUCT_URL = `/admin/catalog/products/${PRODUCT_ID}`;

const bestSeller = (page: Page) => page.getByRole('switch', { name: 'Best Seller' });
const express = (page: Page) =>
  page.getByRole('switch', { name: '2-Day Express Production Available' });

async function setBoth(page: Page, on: boolean) {
  for (const control of [bestSeller(page), express(page)]) {
    await expect(control).toBeVisible();
    if ((await control.isChecked()) !== on) await control.click();
    await expect(control).toBeChecked({ checked: on });
  }
}

async function saveAndReload(page: Page) {
  await page.getByRole('button', { name: 'Save product' }).click();
  await expect(page.getByText('Product saved.')).toBeVisible();
  await page.reload();
}

/** What the customer catalogue API returns for the product. */
async function customerFlags() {
  const api = await createApiContext('CUSTOMER');
  try {
    const res = await api.get(`products/${PRODUCT_ID}`);
    expect(res.ok(), await res.text()).toBe(true);
    const { isBestSeller, expressProduction } = (await res.json()) as {
      isBestSeller: boolean;
      expressProduction: boolean;
    };
    return { isBestSeller, expressProduction };
  } finally {
    await api.dispose();
  }
}

test.describe('Admin product badge flags @comprehensive @admin', () => {
  test('an admin turns both flags on and off, and they stay saved (TTW-267)', async ({
    adminPage,
  }) => {
    await adminPage.goto(PRODUCT_URL);
    // A retry must not trip over flags an earlier attempt left on.
    await setBoth(adminPage, false);
    await saveAndReload(adminPage);

    await setBoth(adminPage, true);
    await saveAndReload(adminPage);
    await expect(bestSeller(adminPage)).toBeChecked();
    await expect(express(adminPage)).toBeChecked();
    expect(await customerFlags()).toEqual({ isBestSeller: true, expressProduction: true });

    await setBoth(adminPage, false);
    await saveAndReload(adminPage);
    await expect(bestSeller(adminPage)).not.toBeChecked();
    await expect(express(adminPage)).not.toBeChecked();
    expect(await customerFlags()).toEqual({ isBestSeller: false, expressProduction: false });
  });
});
