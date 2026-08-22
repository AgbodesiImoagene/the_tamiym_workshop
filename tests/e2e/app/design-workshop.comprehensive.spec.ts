import { expect } from '@playwright/test';
import { test } from '../fixtures/test';
import { assertVisibleControlsEnabled } from '../fixtures/interactions';
import { describeViewportMatrix } from '../fixtures/viewport-suite';

describeViewportMatrix('Customer design workshop @comprehensive @app', () => {
  test('design page loads workshop shell and controls', async ({ customerPage }) => {
    await customerPage.goto('/dashboard/design');
    await expect(customerPage.getByRole('heading', { name: /Design/i })).toBeVisible();
    await assertVisibleControlsEnabled(customerPage.locator('main'));
  });

  test('checkout page entry from cart when items exist', async ({ customerPage }) => {
    await customerPage.goto('/dashboard/cart');
    const checkout = customerPage.getByRole('link', { name: /Proceed to checkout/i });
    if (await checkout.isVisible()) {
      await checkout.click();
      await expect(customerPage).toHaveURL(/\/dashboard\/checkout/);
      await assertVisibleControlsEnabled(customerPage.locator('main'));
    }
  });
});
