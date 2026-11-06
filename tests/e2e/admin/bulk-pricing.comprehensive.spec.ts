import { expect, type Page } from '@playwright/test';
import { test } from '../fixtures/test';

const MIN_QUANTITY = 90_000;
const OPEN_ENDED = `${MIN_QUANTITY}+ units`;
const BOUNDED = `${MIN_QUANTITY} to 95000 units`;

function tierRow(page: Page, label: string) {
  const editButton = page.getByRole('button', { name: 'Edit' });
  return page.locator('div').filter({ hasText: label }).filter({ has: editButton }).last();
}

async function editTier(page: Page, label: string) {
  await tierRow(page, label).getByRole('button', { name: 'Edit' }).click();
}

/** A retry must not trip over the tier an earlier attempt left behind. */
async function deleteLeftoverTier(page: Page) {
  await expect(
    page.getByRole('button', { name: 'Edit' }).first().or(page.getByText('No tiers yet'))
  ).toBeVisible();

  for (const label of [OPEN_ENDED, BOUNDED]) {
    if ((await page.getByText(label).count()) > 0) {
      await editTier(page, label);
      await page.getByRole('button', { name: 'Delete tier' }).click();
      await expect(page.getByText(label)).toBeHidden();
    }
  }
}

test.describe('Admin bulk pricing @comprehensive @admin', () => {
  test('saves, edits and filters a tier with no maximum', async ({ adminPage }) => {
    await adminPage.goto('/admin/pricing/bulk-pricing');
    await deleteLeftoverTier(adminPage);

    await adminPage.getByLabel('Product', { exact: true }).click();
    await adminPage.getByRole('option', { name: /Classic Tee/ }).click();
    await adminPage.getByLabel('Min quantity').fill(String(MIN_QUANTITY));
    await expect(adminPage.getByLabel('Max quantity')).toHaveValue('');
    await adminPage.getByLabel('Price per unit').fill('1000');
    await adminPage.getByRole('button', { name: 'Create tier' }).click();

    await expect(adminPage.getByText('Bulk pricing tier created.')).toBeVisible();
    await expect(adminPage.getByText(OPEN_ENDED)).toBeVisible();

    await adminPage.getByLabel('Filter by product').click();
    await adminPage.getByRole('option', { name: /Campus Hoodie/ }).click();
    await expect(adminPage.getByText(OPEN_ENDED)).toBeHidden();
    await adminPage.getByLabel('Filter by product').click();
    await adminPage.getByRole('option', { name: 'All products' }).click();
    await expect(adminPage.getByText(OPEN_ENDED)).toBeVisible();

    await editTier(adminPage, OPEN_ENDED);
    await adminPage.getByLabel('Max quantity').fill('95000');
    await adminPage.getByRole('button', { name: 'Save tier' }).click();
    await expect(adminPage.getByText(BOUNDED)).toBeVisible();

    await adminPage.getByLabel('Max quantity').clear();
    await adminPage.getByRole('button', { name: 'Save tier' }).click();
    await expect(adminPage.getByText(OPEN_ENDED)).toBeVisible();

    await adminPage.getByRole('button', { name: 'Delete tier' }).click();
    await expect(adminPage.getByText(OPEN_ENDED)).toBeHidden();
  });

  // Uses the plain page: this journey provokes a 400 on purpose, which the browser
  // logs as a console error and the strict adminPage guard would fail on.
  test('explains why a quantity is too large and saves nothing', async ({ page }) => {
    await page.goto('/admin/pricing/bulk-pricing');

    await page.getByLabel('Product', { exact: true }).click();
    await page.getByRole('option', { name: /Classic Tee/ }).click();
    await page.getByLabel('Min quantity').fill(String(MIN_QUANTITY));
    await page.getByLabel('Max quantity').fill('2147483647');
    await page.getByLabel('Price per unit').fill('1000');
    await page.getByRole('button', { name: 'Create tier' }).click();

    await expect(page.getByText('maxQuantity must be 2147483646 or less.')).toBeVisible();
    await expect(page.getByText('Bulk pricing tier created.')).toBeHidden();
    await expect(page.getByText(`${MIN_QUANTITY} to 2147483647 units`)).toBeHidden();
  });
});
