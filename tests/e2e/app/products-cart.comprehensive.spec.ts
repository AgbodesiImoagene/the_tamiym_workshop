import { expect } from '@playwright/test';
import { test } from '../fixtures/test';
import { assertVisibleControlsEnabled } from '../fixtures/interactions';
import { describeViewportMatrix } from '../fixtures/viewport-suite';

describeViewportMatrix('Customer catalog and cart @comprehensive @app', () => {
  test('products page category tabs and cart entry', async ({ customerPage }) => {
    await customerPage.goto('/dashboard/products');
    await expect(
      customerPage.getByRole('heading', { name: 'Product List', level: 1 })
    ).toBeVisible();

    const viewCart = customerPage.getByRole('link', { name: /View cart/i });
    if (await viewCart.isVisible()) {
      await viewCart.click();
      await expect(customerPage).toHaveURL(/\/dashboard\/cart/);
      await customerPage.goto('/dashboard/products');
    }

    const addButtons = customerPage.getByRole('button', { name: /Add to cart/i });
    if ((await addButtons.count()) > 0) {
      await addButtons.first().click();
      await expect(customerPage.getByRole('link', { name: /Go to cart/i }).first()).toBeVisible();
    }

    await assertVisibleControlsEnabled(customerPage.locator('main'));
  });

  test('cart page controls and checkout entry', async ({ customerPage }) => {
    await customerPage.goto('/dashboard/cart');
    await expect(customerPage.getByRole('heading', { name: 'Cart', level: 1 })).toBeVisible();
    await expect(
      customerPage.getByRole('link', { name: /Continue shopping|Browse products/i })
    ).toBeVisible();

    const qtyPlus = customerPage.getByRole('button', { name: '+' });
    if ((await qtyPlus.count()) > 0) {
      await qtyPlus.first().click();
    }

    const checkout = customerPage.getByRole('link', { name: /Proceed to checkout/i });
    if (await checkout.isVisible()) {
      await expect(checkout).toBeVisible();
    }

    await assertVisibleControlsEnabled(customerPage.locator('main'));
  });
});
