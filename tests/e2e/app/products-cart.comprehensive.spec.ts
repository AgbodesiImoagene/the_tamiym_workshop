import path from 'node:path';
import { authDir, expect, test, urls, attachStrictPageGuards } from '../fixtures/test';
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

    // TTW-092: a card no longer adds a default variant; it opens the product page.
    await expect(customerPage.getByRole('button', { name: /Add to cart/i })).toHaveCount(0);
    const viewProduct = customerPage.getByRole('link', { name: 'View product' });
    if ((await viewProduct.count()) > 0) {
      await viewProduct.first().click();
      await expect(customerPage).toHaveURL(/\/dashboard\/products\/[^/]+$/);
      await expect(customerPage.getByRole('heading', { level: 1 })).toBeVisible();
    }

    await assertVisibleControlsEnabled(customerPage.locator('main'));
  });

  test('buys several sizes of one product in a single action (TTW-092)', async ({
    customerPage,
  }) => {
    await customerPage.goto('/dashboard/products/e2e-product-campus-hoodie');
    await expect(
      customerPage.getByRole('heading', { name: 'Campus Hoodie', level: 1 })
    ).toBeVisible();

    const addToCart = customerPage.getByRole('button', { name: 'Add to cart' });
    await expect(addToCart).toBeDisabled();

    await customerPage.getByLabel('Quantity for Small').fill('2');
    await customerPage.getByLabel('Quantity for Medium').fill('3');
    await expect(addToCart).toBeEnabled();
    await addToCart.click();
    await expect(customerPage.getByRole('status')).toHaveText(/5 items were added to your cart/i);

    await customerPage.getByRole('link', { name: 'Go to cart' }).click();
    await expect(customerPage).toHaveURL(/\/dashboard\/cart/);
    await expect(customerPage.getByRole('heading', { name: 'Campus Hoodie' })).toHaveCount(2);
    await expect(customerPage.getByText('Size: Small')).toBeVisible();
    await expect(customerPage.getByText('Size: Medium')).toBeVisible();

    await assertVisibleControlsEnabled(customerPage.locator('main'));
  });

  test('product page shows a clear message for an unknown product (TTW-092)', async ({
    browser,
  }) => {
    const context = await browser.newContext({
      baseURL: urls.app,
      storageState: path.join(authDir, 'customer.json'),
    });
    try {
      const page = await context.newPage();
      // The unknown product is a deliberate 404, which Chromium logs as a console error.
      // The strict guard tolerates that one line for this request only.
      const assertClean = attachStrictPageGuards(page, {
        allowConsoleError: (message) =>
          message.text().includes('status of 404') &&
          /\/v1\/products\/does-not-exist$/.test(message.location().url),
      });

      await page.goto('/dashboard/products/does-not-exist');
      await expect(page.getByText(/product could not be found/i)).toBeVisible();
      await page.getByRole('link', { name: 'Back to products' }).click();
      await expect(page).toHaveURL(/\/dashboard\/products$/);
      assertClean();
    } finally {
      await context.close();
    }
  });

  test('cart page controls and checkout entry', async ({ customerPage }) => {
    await customerPage.goto('/dashboard/cart');
    await expect(customerPage.getByRole('heading', { name: 'Cart', level: 1 })).toBeVisible();
    await expect(
      customerPage.getByRole('link', { name: /Continue shopping|Browse products/i }).first()
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
