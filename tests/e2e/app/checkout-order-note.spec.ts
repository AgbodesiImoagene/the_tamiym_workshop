import { expect } from '@playwright/test';
import { test } from '../fixtures/test';

/**
 * TTW-197 — the note typed at checkout is stored on the order, shown to the
 * customer on the order page, and shown to the admin on the admin order page,
 * as plain text.
 *
 * Quote and order creation hit the real API. Only payment initiation is
 * intercepted and answered with a simulated Paystack session (ordinary CI never
 * calls live Paystack), as in checkout-idempotency.spec.ts.
 */
const NOTE = 'Pack the hoodies apart <img src=x onerror="window.__noteXss=1">';

test.describe('Checkout order note @app @journey', () => {
  test('a note typed at checkout is seen by the customer and by the admin', async ({
    customerPage,
    adminPage,
    paystack,
  }) => {
    let orderId: string | undefined;
    customerPage.on('response', async (response) => {
      if (response.request().method() === 'POST' && /\/v1\/orders$/.test(response.url())) {
        const body = (await response.json().catch(() => null)) as { id?: string } | null;
        if (body?.id) orderId = body.id;
      }
    });
    await customerPage.route('**/v1/orders/*/initiate-payment', async (route) => {
      const id = route.request().url().split('/orders/')[1].split('/')[0];
      const session = paystack.initializeTransaction(`ord-${id}`);
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ ...session, attemptOutcome: session.outcome }),
      });
    });
    await customerPage.route('https://checkout.paystack.test/**', (route) =>
      route.fulfill({ status: 200, contentType: 'text/html', body: '<h1>Paystack test</h1>' })
    );

    await customerPage.goto('/dashboard/products/e2e-product-campus-hoodie');
    await customerPage.getByLabel('Quantity for Small').fill('1');
    await customerPage.getByRole('button', { name: 'Add to cart' }).click();
    await expect(customerPage.getByRole('status')).toHaveText(/added to your cart/i);

    await customerPage.goto('/dashboard/checkout');
    await expect(customerPage.getByLabel('City')).toHaveValue('Ikeja');
    const note = customerPage.getByLabel('Order note (optional)');
    await expect(note).toHaveAttribute('maxlength', '500');
    await note.fill(NOTE);
    await expect(customerPage.getByText(`${NOTE.length} / 500`)).toBeVisible();

    await customerPage.getByRole('button', { name: 'Review quote' }).click();
    await customerPage.getByRole('button', { name: 'Place order and pay' }).click();
    await customerPage.waitForURL(/checkout\.paystack\.test/);
    expect(orderId, 'order id from POST /v1/orders').toBeTruthy();

    // Customer: read-only text on the order page.
    await customerPage.goto(`/dashboard/orders/${orderId}`);
    await expect(customerPage.getByRole('heading', { name: 'Order note' })).toBeVisible();
    await expect(customerPage.getByText(NOTE, { exact: true })).toBeVisible();
    expect(await customerPage.locator('main img[src="x"]').count()).toBe(0);
    expect(await customerPage.evaluate(() => (window as { __noteXss?: number }).__noteXss)).toBe(
      undefined
    );

    // Admin: the same text on the admin order page.
    await adminPage.goto(`/admin/orders/${orderId}`);
    await expect(adminPage.getByRole('heading', { name: /Order detail/i })).toBeVisible();
    await expect(adminPage.getByTestId('admin-order-customer-note')).toHaveText(NOTE);
    expect(await adminPage.locator('main img[src="x"]').count()).toBe(0);
    expect(await adminPage.evaluate(() => (window as { __noteXss?: number }).__noteXss)).toBe(
      undefined
    );
  });
});
