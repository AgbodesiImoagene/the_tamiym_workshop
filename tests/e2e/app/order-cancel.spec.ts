import { expect } from '@playwright/test';
import { addClassicTeeToCart } from '../fixtures/cart';
import { test } from '../fixtures/test';

/**
 * TTW-107 — a customer places an order, leaves without paying, and cancels it
 * from its page. The order shows as cancelled and offers no way to cancel again.
 *
 * Quote and order creation hit the real API, and so does the cancel. Only
 * payment initiation is intercepted and answered with a simulated Paystack
 * session (ordinary CI never calls live Paystack), as in checkout-order-note.spec.ts.
 */

// Its own customer, because checkout saves the address and parallel journeys must not share it.
test.use({ customerAuthState: 'customer-order-cancel' });

test.describe('Customer cancels an unpaid order @app @journey', () => {
  test('the customer cancels an order awaiting payment from its page', async ({
    customerPage,
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

    await addClassicTeeToCart(customerPage);
    await customerPage.goto('/dashboard/checkout');
    await expect(customerPage.getByLabel('City')).toHaveValue('Ikeja');
    await customerPage.getByRole('button', { name: 'Review quote' }).click();
    await customerPage.getByRole('button', { name: 'Place order and pay' }).click();
    await customerPage.waitForURL(/checkout\.paystack\.test/);
    expect(orderId, 'order id from POST /v1/orders').toBeTruthy();

    // The customer walks away from the payment page and opens the order.
    await customerPage.goto(`/dashboard/orders/${orderId}`);
    const cancel = customerPage.getByRole('button', { name: 'Cancel order' });
    await expect(cancel).toBeVisible();

    // Backing out changes nothing.
    await cancel.click();
    await customerPage.getByRole('button', { name: 'Keep order' }).click();
    await expect(cancel).toBeVisible();

    await cancel.click();
    await expect(customerPage.getByRole('heading', { name: 'Cancel this order?' })).toBeVisible();
    await customerPage.getByRole('button', { name: 'Yes, cancel order' }).click();

    await expect(customerPage.getByText('Order cancelled', { exact: true })).toBeVisible();
    await expect(customerPage.getByRole('button', { name: 'Cancel order' })).toHaveCount(0);

    // The cancellation is on the server, not only on this screen.
    await customerPage.reload();
    await expect(customerPage.getByText('Order cancelled', { exact: true })).toBeVisible();
    await expect(customerPage.getByRole('button', { name: 'Cancel order' })).toHaveCount(0);
  });
});
