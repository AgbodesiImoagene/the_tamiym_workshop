import { expect } from '@playwright/test';
import { test } from '../fixtures/test';
import { assertVisibleControlsEnabled } from '../fixtures/interactions';
import { describeViewportMatrix } from '../fixtures/viewport-suite';
import { E2E_ORDER_PAID_ID } from '../fixtures/seed-data';

describeViewportMatrix('Customer orders @comprehensive @app', () => {
  test('orders list and detail navigation', async ({ customerPage }) => {
    await customerPage.goto('/dashboard/orders');
    await expect(customerPage.getByRole('heading', { name: 'Orders', level: 1 })).toBeVisible();

    const details = customerPage.getByRole('link', { name: /Order Details/i });
    if ((await details.count()) > 0) {
      await details.first().click();
      await expect(customerPage).toHaveURL(/\/dashboard\/orders\//);
      await expect(customerPage.getByRole('link', { name: /Back to orders/i })).toBeVisible();
      await customerPage.getByRole('button', { name: /Refresh/i }).click();
    }

    await assertVisibleControlsEnabled(customerPage.locator('main'));
  });

  test('order confirmation page controls', async ({ customerPage }) => {
    await customerPage.goto(`/orders/${E2E_ORDER_PAID_ID}/confirm`);
    await expect(customerPage.getByRole('button', { name: /Refresh status/i })).toBeVisible();
    const orderDetail = customerPage.getByRole('link', {
      name: /View order detail|Open order detail/i,
    });
    if (await orderDetail.isVisible()) {
      await expect(orderDetail).toBeVisible();
    }
    await assertVisibleControlsEnabled(customerPage.locator('main'));
  });
});
