import { expect } from '@playwright/test';
import { test } from '../fixtures/test';
import { assertVisibleControlsEnabled } from '../fixtures/interactions';
import { describeViewportMatrix } from '../fixtures/viewport-suite';

describeViewportMatrix('Admin catalog and settings @comprehensive @admin', () => {
  test('catalog products list and new product entry', async ({ adminPage }) => {
    await adminPage.goto('/admin/catalog/products');
    await expect(adminPage.getByRole('heading', { name: /^Products$/i })).toBeVisible();
    await expect(adminPage.getByRole('link', { name: /New product/i })).toBeVisible();

    await adminPage.getByRole('link', { name: /New product/i }).click();
    await expect(adminPage.getByRole('heading', { name: /New product/i })).toBeVisible();
    await expect(adminPage.locator('#np-name')).toBeVisible();
    await expect(adminPage.getByRole('button', { name: /Create product/i })).toBeVisible();
    await assertVisibleControlsEnabled(adminPage.locator('main'));
  });

  test('categories workspace form controls', async ({ adminPage }) => {
    await adminPage.goto('/admin/catalog/categories');
    await expect(adminPage.getByRole('heading', { name: /Categories/i })).toBeVisible();
    await expect(adminPage.locator('#name')).toBeVisible();
    await expect(adminPage.getByRole('button', { name: /Create category/i })).toBeVisible();
    await assertVisibleControlsEnabled(adminPage.locator('main'));
  });

  test('site settings payout and pricing panels', async ({ adminPage }) => {
    await adminPage.goto('/admin/settings/site');
    await expect(adminPage.getByRole('heading', { name: /Site settings/i })).toBeVisible();
    await expect(adminPage.locator('#vatRatePercent')).toBeVisible();
    await expect(adminPage.locator('#payoutMode')).toBeVisible();
    await expect(adminPage.getByRole('button', { name: /Save site settings/i })).toBeVisible();
    await expect(adminPage.getByRole('button', { name: /Reset unsaved changes/i })).toBeVisible();
    await assertVisibleControlsEnabled(adminPage.locator('main'));
  });

  test('payout runs workspace create panel', async ({ adminPage }) => {
    await adminPage.goto('/admin/payouts/runs');
    await expect(adminPage.getByRole('heading', { name: /Payout runs/i })).toBeVisible();
    await expect(adminPage.locator('#status')).toBeVisible();

    const cutoff = adminPage.locator('#cutoffAt');
    if (await cutoff.isVisible()) {
      await expect(cutoff).toBeVisible();
      await expect(adminPage.getByRole('button', { name: /Create payout run/i })).toBeVisible();
    }

    await assertVisibleControlsEnabled(adminPage.locator('main'));
  });
});
