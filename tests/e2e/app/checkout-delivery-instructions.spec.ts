import { expect } from '@playwright/test';
import { test } from '../fixtures/test';

/**
 * TTW-198 — delivery instructions typed at checkout are saved on the order and read,
 * as plain text, by the customer and by the admin preparing the parcel.
 *
 * Order creation and quoting hit the real API. Only payment initiation is replaced by a
 * simulated Paystack session (ordinary CI never calls live Paystack).
 */
test.describe('Delivery instructions at checkout @app @admin @journey', () => {
  test('the customer types them at checkout and the admin reads them on the order', async ({
    customerPage,
    adminPage,
    paystack,
  }) => {
    const instructions = 'Ring twice.\nLeave with the guard <b>please</b>';

    let orderId: string | null = null;
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
    const field = customerPage.getByLabel('Delivery instructions');
    await expect(field).toHaveAttribute('maxlength', '500');
    await field.fill(instructions);
    await customerPage.getByRole('button', { name: 'Review quote' }).click();
    const placeOrder = customerPage.getByRole('button', { name: 'Place order and pay' });
    await expect(placeOrder).toBeEnabled();
    await placeOrder.click();
    await customerPage.waitForURL(/checkout\.paystack\.test/);
    expect(orderId).not.toBeNull();

    // The customer reads the instructions saved on the order.
    await customerPage.goto(`/dashboard/orders/${orderId}`);
    const customerText = customerPage.getByTestId('order-delivery-instructions');
    await expect(customerText).toHaveText(instructions);
    await expect(customerText.locator('b')).toHaveCount(0);

    // The admin reads the same text, as text, in the shipping block of that order.
    await adminPage.goto(`/admin/orders/${orderId}`);
    await expect(adminPage.getByText('Delivery instructions')).toBeVisible();
    const adminText = adminPage.getByTestId('order-delivery-instructions');
    await expect(adminText).toHaveText(instructions);
    await expect(adminText.locator('b')).toHaveCount(0);

    // Editing the address afterwards does not rewrite the order.
    await customerPage.goto('/dashboard/checkout');
    await expect(customerPage.getByLabel('Delivery instructions')).toHaveValue(instructions);
    await customerPage.getByLabel('Delivery instructions').fill('Different text');
    await customerPage.getByRole('button', { name: 'Review quote' }).click();
    await expect(customerPage.getByRole('button', { name: 'Place order and pay' })).toBeEnabled();
    await adminPage.reload();
    await expect(adminPage.getByTestId('order-delivery-instructions')).toHaveText(instructions);
  });
});
