import { expect } from '@playwright/test';
import { test } from '../fixtures/test';
import { assertVisibleControlsEnabled } from '../fixtures/interactions';
import { describeViewportMatrix } from '../fixtures/viewport-suite';
import { E2E_CAMPAIGN_SLUG_ACTIVE } from '../fixtures/seed-data';

describeViewportMatrix('Web fundraiser detail @comprehensive @web @critical', () => {
  test('active campaign product controls respond', async ({ page }) => {
    await page.goto(`/fundraiser/${E2E_CAMPAIGN_SLUG_ACTIVE}`);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();

    const tabs = page.getByRole('tab');
    if ((await tabs.count()) > 0) {
      await tabs.first().click();
    }

    await expect(page.getByRole('button', { name: /Increase quantity/i })).toBeVisible();
    await page.getByRole('button', { name: /Increase quantity/i }).click();
    await page.getByRole('button', { name: /Decrease quantity/i }).click();

    await expect(page.getByRole('button', { name: /Add to cart/i })).toBeVisible();
    await page.getByRole('button', { name: /Add to cart/i }).click();
    await expect(page.getByRole('button', { name: /Checkout/i })).toBeEnabled();

    await assertVisibleControlsEnabled(page.locator('main'));
  });

  test('missing slug shows not-found recovery actions', async ({ page }) => {
    await page.goto('/fundraiser/definitely-missing-slug-e2e');
    await expect(page.getByRole('heading', { name: /no longer available/i })).toBeVisible();
    await expect(page.getByRole('link', { name: /Back to Fundraiser/i })).toBeVisible();
    await expect(page.getByRole('link', { name: /Create An Account/i })).toBeVisible();
  });
});
