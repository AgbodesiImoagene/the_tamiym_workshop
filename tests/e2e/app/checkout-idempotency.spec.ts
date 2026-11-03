import { expect } from '@playwright/test';
import { test } from '../fixtures/test';

/**
 * TTW-037 — a retry after a failed payment initiation reuses the same order
 * and keeps the cart until payment settles.
 *
 * Order creation and quoting hit the real API. Only payment initiation is
 * intercepted: the first call fails at the network layer, the second returns a
 * simulated Paystack session (ordinary CI never calls live Paystack).
 */
test.describe('Customer checkout retry @app @journey', () => {
  test('re-clicking after a payment initiation failure creates one order', async ({
    customerPage,
    paystack,
  }) => {
    const createdOrderIds: string[] = [];
    customerPage.on('response', async (response) => {
      if (response.request().method() === 'POST' && /\/v1\/orders$/.test(response.url())) {
        const body = (await response.json().catch(() => null)) as { id?: string } | null;
        if (body?.id) createdOrderIds.push(body.id);
      }
    });

    let initiateCalls = 0;
    await customerPage.route('**/v1/orders/*/initiate-payment', async (route) => {
      initiateCalls += 1;
      if (initiateCalls === 1) {
        // Dropped connection; the strict page guard tolerates ERR_ABORTED only.
        await route.abort('aborted');
        return;
      }
      const orderId = route.request().url().split('/orders/')[1].split('/')[0];
      const session = paystack.initializeTransaction(`ord-${orderId}`);
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ ...session, attemptOutcome: session.outcome }),
      });
    });
    await customerPage.route('https://checkout.paystack.test/**', (route) =>
      route.fulfill({ status: 200, contentType: 'text/html', body: '<h1>Paystack test</h1>' })
    );

    await customerPage.goto('/dashboard/products');
    await customerPage
      .locator('article')
      .filter({ has: customerPage.getByText('Classic Tee', { exact: true }) })
      .getByRole('button', { name: 'Add to cart' })
      .click();
    await expect(customerPage.getByText('Classic Tee was added to your cart.')).toBeVisible();

    await customerPage.goto('/dashboard/checkout');
    await expect(customerPage.getByLabel('City')).toHaveValue('Ikeja');
    // The seeded address phone (08000000004) fails the API's @IsPhoneNumber() check on
    // save; enter an international number like the DTO example.
    await customerPage.getByLabel('Phone').fill('+2348012345678');
    await customerPage.getByRole('button', { name: 'Review quote' }).click();
    const placeOrder = customerPage.getByRole('button', { name: 'Place order and pay' });
    await expect(placeOrder).toBeEnabled();

    await placeOrder.click();
    await expect(customerPage.getByRole('button', { name: 'Place order and pay' })).toBeEnabled();
    await expect(customerPage.getByText('Classic Tee').first()).toBeVisible();

    await placeOrder.click();
    await customerPage.waitForURL(/checkout\.paystack\.test/);

    expect(initiateCalls).toBe(2);
    expect(createdOrderIds).toHaveLength(2);
    expect(new Set(createdOrderIds).size).toBe(1);

    await customerPage.goto('/dashboard/cart');
    await expect(customerPage.getByRole('heading', { name: 'Classic Tee' })).toBeVisible();
    await expect(customerPage.getByRole('link', { name: 'Proceed to checkout' })).toBeVisible();
  });
});
