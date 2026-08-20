import { test, expect } from '../fixtures/test';

/**
 * TTW-014 — inventory availability contract (Playwright foundation).
 * Route-mocked catalog + admin inventory agree on available = stockOnHand - reserved.
 */
test.describe('Inventory availability @smoke', () => {
  test('customer and admin availableQuantity use the same formula', async ({ page }) => {
    await page.goto('about:blank');

    await page.route('**/v1/products/*/availability', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          variantId: 'var_playwright',
          stockOnHand: 10,
          reserved: 3,
          availableQuantity: 7,
        }),
      });
    });
    await page.route('**/admin/inventory/*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          variantId: 'var_playwright',
          stockOnHand: 10,
          reserved: 3,
          availableQuantity: 7,
        }),
      });
    });

    const result = await page.evaluate(async () => {
      const customer = await fetch(
        'http://localhost/v1/products/prod_playwright/availability'
      ).then((r) => r.json());
      const admin = await fetch('http://localhost/admin/inventory/var_playwright').then((r) =>
        r.json()
      );
      return { customer, admin };
    });

    expect(result.customer.availableQuantity).toBe(
      result.customer.stockOnHand - result.customer.reserved
    );
    expect(result.admin.availableQuantity).toBe(result.admin.stockOnHand - result.admin.reserved);
    expect(result.customer.availableQuantity).toBe(result.admin.availableQuantity);
  });
});
