import { type BrowserContext, type Page } from '@playwright/test';
import { createAdminApi } from '../fixtures/admin-api';
import { originForSurface } from '../fixtures/api';
import { e2eUsers, expect, test, urls } from '../fixtures/test';

/**
 * TTW-058: a customer orders saved designs from the Design Workshop. Two designs on the same
 * variant stay two cart lines and two order items (the criterion TTW-037 deferred), the cart
 * and checkout say which design each line carries, and a design a moderator rejected cannot
 * be ordered.
 *
 * The journey uses its own seeded customer (`designOrder`), so it does not touch the shared
 * customers' carts or addresses; the refusal test registers a throwaway one. Quote and order creation hit the real API; only payment initiation is answered
 * with a simulated Paystack session, as in checkout-order-note.spec.ts.
 */
const TEE_PRODUCT_ID = 'e2e-product-classic-tee';
const TEE_FRONT_VIEW_ID = 'e2e-product-view-tee-front';

async function createDesign(context: BrowserContext, csrfToken: string, name: string) {
  const created = await context.request.post(`${urls.api}/v1/designs`, {
    headers: { Origin: originForSurface('CUSTOMER'), 'x-csrf-token': csrfToken },
    data: {
      name,
      productId: TEE_PRODUCT_ID,
      designData: {
        version: 1,
        productId: TEE_PRODUCT_ID,
        views: {
          front: {
            productViewId: TEE_FRONT_VIEW_ID,
            fabricJson: { objects: [{ type: 'i-text', text: name, left: 50, top: 50 }] },
            isUsed: true,
            layerCount: 1,
          },
        },
      },
    },
  });
  expect(created.status(), await created.text()).toBe(201);
  return (await created.json()) as { id: string; name: string };
}

async function orderFromList(page: Page, designName: string) {
  await page.goto('/dashboard/design');
  const card = page.getByRole('article').filter({ hasText: designName });
  await card.getByRole('link', { name: 'Order' }).click();
  await expect(page.getByText('Ordering your design')).toBeVisible();
  await expect(page.getByText(designName, { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Navy' }).click();
}

// Its own customer (seeded, email verified): checkout saves the address and refuses an
// unverified email, and parallel journeys must not share either.
test.describe('Order saved designs @comprehensive @app', () => {
  test.use({ customerAuthState: 'customer-design-order' });

  test('two designs on one variant make two cart lines and two order items', async ({
    customerPage: page,
    paystack,
  }) => {
    const stamp = Date.now();
    const context = page.context();
    {
      const me = await context.request.get(`${urls.api}/v1/auth/me`, {
        headers: { Origin: originForSurface('CUSTOMER') },
      });
      expect(me.ok(), await me.text()).toBeTruthy();
      const csrfToken = ((await me.json()) as { csrf_token?: string }).csrf_token ?? '';
      const first = await createDesign(context, csrfToken, `Logo A ${stamp}`);
      const second = await createDesign(context, csrfToken, `Logo B ${stamp}`);

      let orderId: string | undefined;
      page.on('response', async (response) => {
        if (response.request().method() === 'POST' && /\/v1\/orders$/.test(response.url())) {
          const body = (await response.json().catch(() => null)) as { id?: string } | null;
          if (body?.id) orderId = body.id;
        }
      });
      await page.route('**/v1/orders/*/initiate-payment', async (route) => {
        const id = route.request().url().split('/orders/')[1].split('/')[0];
        const session = paystack.initializeTransaction(`ord-${id}`);
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ ...session, attemptOutcome: session.outcome }),
        });
      });
      await page.route('https://checkout.paystack.test/**', (route) =>
        route.fulfill({ status: 200, contentType: 'text/html', body: '<h1>Paystack test</h1>' })
      );

      // Design A in Navy Medium and White Large, priced by the server before it goes to the cart.
      await orderFromList(page, first.name);
      await page.getByLabel('Quantity for Medium').fill('1');
      await page.getByRole('button', { name: 'White' }).click();
      await page.getByLabel('Quantity for Large').fill('1');
      await page.getByRole('button', { name: 'Get price' }).click();
      await expect(page.getByText(/^Subtotal:/)).toBeVisible();
      await page.getByRole('button', { name: 'Add to cart' }).click();
      await expect(page.getByText(/2 items were added to your cart/i)).toBeVisible();

      // Design B on the same Medium variant.
      await orderFromList(page, second.name);
      await page.getByLabel('Quantity for Medium').fill('1');
      await page.getByRole('button', { name: 'Add to cart' }).click();
      await expect(page.getByText(/1 item was added to your cart/i)).toBeVisible();

      await page.goto('/dashboard/cart');
      await expect(page.getByText(`Your design: ${first.name}`)).toHaveCount(2);
      await expect(page.getByText(`Your design: ${second.name}`)).toHaveCount(1);

      await page.goto('/dashboard/checkout');
      await expect(page.getByText(`Your design: ${second.name}`)).toBeVisible();
      await expect(page.getByLabel('City')).toHaveValue('Ikeja');
      await page.getByRole('button', { name: 'Review quote' }).click();
      await page.getByRole('button', { name: 'Place order and pay' }).click();
      await page.waitForURL(/checkout\.paystack\.test/);
      expect(orderId, 'order id from POST /v1/orders').toBeTruthy();

      const order = await context.request.get(`${urls.api}/v1/orders/${orderId}`, {
        headers: { Origin: originForSurface('CUSTOMER') },
      });
      expect(order.ok(), await order.text()).toBeTruthy();
      const { items } = (await order.json()) as {
        items: Array<{ variantId: string; designId: string | null; quantity: number }>;
      };
      expect(items).toHaveLength(3);
      expect(items.filter((item) => item.designId === first.id)).toHaveLength(2);
      const [onSecond] = items.filter((item) => item.designId === second.id);
      expect(onSecond).toBeDefined();
      // Same variant as one of the first design's lines: two designs, one variant, two items.
      expect(
        items.some((item) => item.designId === first.id && item.variantId === onSecond.variantId)
      ).toBe(true);
    }
  });

  test('a design the moderators rejected cannot be ordered', async ({ browser }) => {
    const stamp = Date.now();
    const context = await browser.newContext({ baseURL: urls.app });
    try {
      const register = await context.request.post(`${urls.api}/v1/auth/register`, {
        headers: { Origin: originForSurface('CUSTOMER') },
        data: {
          email: `design.rejected.${stamp}@tamiym.test`,
          password: e2eUsers.customer.password,
          firstName: 'Design',
          lastName: 'Rejected',
        },
      });
      expect(register.ok(), await register.text()).toBeTruthy();
      const csrfToken = ((await register.json()) as { csrf_token?: string }).csrf_token ?? '';
      const design = await createDesign(context, csrfToken, `Rejected ${stamp}`);

      const admin = await createAdminApi();
      try {
        const rejected = await admin.patch(`admin/designs/${design.id}/moderation`, {
          data: { status: 'REJECTED', notes: 'Not printable' },
        });
        expect(rejected.ok(), await rejected.text()).toBeTruthy();
      } finally {
        await admin.dispose();
      }

      const page = await context.newPage();
      await page.goto('/dashboard/design');
      const card = page.getByRole('article').filter({ hasText: design.name });
      await expect(card.getByText('Rejected', { exact: true })).toBeVisible();
      await expect(card.getByRole('link', { name: 'Order' })).toHaveCount(0);

      // Typing the address by hand does not get around it.
      await page.goto(`/dashboard/products/${TEE_PRODUCT_ID}?designId=${design.id}`);
      await expect(page.getByText(/was rejected and cannot be ordered/i)).toBeVisible();
      await expect(page.getByRole('button', { name: 'Add to cart' })).toHaveCount(0);
    } finally {
      await context.close();
    }
  });
});
