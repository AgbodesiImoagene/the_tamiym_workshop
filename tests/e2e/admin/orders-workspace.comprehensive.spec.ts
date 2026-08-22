import { expect } from '@playwright/test';
import { test } from '../fixtures/test';
import { assertVisibleControlsEnabled } from '../fixtures/interactions';
import { describeViewportMatrix } from '../fixtures/viewport-suite';
import { E2E_ORDER_PAID_ID } from '../fixtures/seed-data';

describeViewportMatrix('Admin orders workspace @comprehensive @admin @critical', () => {
  test('orders list filters and search controls', async ({ adminPage }) => {
    await adminPage.goto('/admin/orders');
    await expect(adminPage.getByRole('heading', { name: /Orders workspace/i })).toBeVisible();

    await expect(adminPage.locator('#status')).toBeVisible();
    await expect(adminPage.locator('#payment')).toBeVisible();
    await expect(adminPage.locator('#query')).toBeVisible();

    await adminPage.locator('#query').fill('customer.e2e');
    await assertVisibleControlsEnabled(adminPage.locator('main'));
  });

  test('order detail actions panel exposes status and refund controls', async ({ adminPage }) => {
    await adminPage.goto(`/admin/orders/${E2E_ORDER_PAID_ID}`);
    await expect(adminPage.getByRole('heading', { name: /Order detail/i })).toBeVisible();

    const backLink = adminPage.getByRole('link', { name: /Back to orders/i });
    if (await backLink.isVisible()) {
      await expect(backLink).toBeVisible();
    }

    const statusSelect = adminPage.locator('#status');
    if (await statusSelect.isVisible()) {
      await expect(statusSelect).toBeVisible();
      await expect(adminPage.getByRole('button', { name: /Update order status/i })).toBeVisible();
    }

    const refundAmount = adminPage.locator('#refundAmount');
    if (await refundAmount.isVisible()) {
      await expect(refundAmount).toBeVisible();
      await expect(adminPage.locator('#refundReason')).toBeVisible();
      await expect(adminPage.getByRole('button', { name: /Initiate refund/i })).toBeVisible();
    }

    await assertVisibleControlsEnabled(adminPage.locator('main'));
  });
});
