import { expect, test } from '@playwright/test';
import { createAdminApi } from '../fixtures/admin-api';
import { originForSurface } from '../fixtures/api';
import { e2eUsers, urls } from '../fixtures/identities';

/**
 * TTW-236: the public shared-design page shows the design on a canvas for someone with no
 * session. It used to ask for the workshop of `undefined` (404) and fall back to the
 * thumbnail, so the canvas never appeared.
 *
 * The design is created through the API (the editor's "Add to canvas" is not wired), shared,
 * and opened in a fresh browser context that holds no cookie.
 */
const TEE_PRODUCT_ID = 'e2e-product-classic-tee';
const TEE_FRONT_VIEW_ID = 'e2e-product-view-tee-front';

test.describe('Shared design page @comprehensive @app', () => {
  test('a visitor with no session sees the canvas of a shared design', async ({ browser }) => {
    const customer = await browser.newContext({ baseURL: urls.app });
    const visitor = await browser.newContext({ baseURL: urls.app });
    try {
      const register = await customer.request.post(`${urls.api}/v1/auth/register`, {
        headers: { Origin: originForSurface('CUSTOMER') },
        data: {
          email: `shared.canvas.${Date.now()}@tamiym.test`,
          password: e2eUsers.customer.password,
          firstName: 'Shared',
          lastName: 'Canvas',
        },
      });
      expect(register.ok(), await register.text()).toBeTruthy();
      const { csrf_token: csrfToken = '' } = (await register.json()) as { csrf_token?: string };
      const headers = { Origin: originForSurface('CUSTOMER'), 'x-csrf-token': csrfToken };

      const created = await customer.request.post(`${urls.api}/v1/designs`, {
        headers,
        data: {
          name: `Shared ${Date.now()}`,
          productId: TEE_PRODUCT_ID,
          designData: {
            version: 1,
            productId: TEE_PRODUCT_ID,
            views: {
              front: {
                productViewId: TEE_FRONT_VIEW_ID,
                fabricJson: { objects: [{ type: 'i-text', text: 'Hello', left: 50, top: 50 }] },
                isUsed: true,
                layerCount: 1,
              },
            },
          },
        },
      });
      expect(created.status(), await created.text()).toBe(201);
      const design = (await created.json()) as { id: string; name: string };

      // Only an APPROVED design can be shared: approve it as the seeded admin.
      const admin = await createAdminApi();
      try {
        const approved = await admin.patch(`admin/designs/${design.id}/moderation`, {
          data: { status: 'APPROVED' },
        });
        expect(approved.ok(), await approved.text()).toBeTruthy();
      } finally {
        await admin.dispose();
      }

      const shared = await customer.request.post(`${urls.api}/v1/designs/${design.id}/share`, {
        headers,
        data: {},
      });
      expect(shared.status(), await shared.text()).toBe(201);
      const { shareToken } = (await shared.json()) as { shareToken: string };

      const page = await visitor.newPage();
      await page.goto(`/design/shared/${shareToken}`);

      await expect(page.getByRole('heading', { name: design.name })).toBeVisible();
      // The canvas is there (not the thumbnail fallback or "No preview available").
      await expect(page.locator('canvas').first()).toBeVisible();
      await expect(page.getByText('No preview available.')).toHaveCount(0);
    } finally {
      await customer.close();
      await visitor.close();
    }
  });
});
