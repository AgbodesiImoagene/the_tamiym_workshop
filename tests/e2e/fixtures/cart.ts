import { expect, type Page } from '@playwright/test';

/**
 * TTW-092: the product list no longer has an "Add to cart" button; sizes and colours
 * are chosen on the product page. Journeys that only need "something in the cart"
 * use this: one Medium Classic Tee in Navy (seeded by `seed:e2e`).
 */
export async function addClassicTeeToCart(page: Page) {
  await page.goto('/dashboard/products/e2e-product-classic-tee');
  await expect(page.getByRole('heading', { name: 'Classic Tee', level: 1 })).toBeVisible();
  await page.getByRole('button', { name: 'Navy' }).click();
  await page.getByLabel('Quantity for Medium').fill('1');
  await page.getByRole('button', { name: 'Add to cart' }).click();
  await expect(page.getByRole('status')).toHaveText(/1 item was added to your cart/i);
}
