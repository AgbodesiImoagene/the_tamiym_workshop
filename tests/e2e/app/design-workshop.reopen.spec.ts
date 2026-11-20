import { expect, test, type Browser, type BrowserContext } from '@playwright/test';
import { originForSurface } from '../fixtures/api';
import { e2eUsers, urls } from '../fixtures/identities';

/**
 * TTW-233: a saved design can be opened again. `/dashboard/design/<id>/edit` used to answer
 * 404 (the page read the design on the server, where the customer's cookie is not available):
 * right after the first save, on a direct load and on a reload.
 *
 * Each test registers its own customer, so it does not touch the designs of the shared one.
 *
 * "Add to canvas" does nothing on this code (the editor's canvas reference is never set; the
 * layer work of TTW-102 replaces it), so the design with a layer is created through the API.
 */
const TEE_PRODUCT_ID = 'e2e-product-classic-tee';
const TEE_FRONT_VIEW_ID = 'e2e-product-view-tee-front';

interface SavedDesign {
  id: string;
  name: string;
  designData: { views: Record<string, { fabricJson: { objects: { text?: string }[] } }> };
}

function layerTexts(design: SavedDesign): (string | undefined)[] {
  return Object.values(design.designData.views).flatMap((view) =>
    view.fabricJson.objects.map((object) => object.text)
  );
}

/** A new customer, signed in. Returns the browser context and the CSRF token for API writes. */
async function newCustomer(browser: Browser, label: string) {
  const context = await browser.newContext({ baseURL: urls.app });
  const register = await context.request.post(`${urls.api}/v1/auth/register`, {
    headers: { Origin: originForSurface('CUSTOMER') },
    data: {
      email: `reopen.${label}.${Date.now()}@tamiym.test`,
      password: e2eUsers.customer.password,
      firstName: 'Reopen',
      lastName: label,
    },
  });
  expect(register.ok(), await register.text()).toBeTruthy();
  const body = (await register.json()) as { csrf_token?: string };
  return { context, csrfToken: body.csrf_token ?? '' };
}

async function createDesignThroughApi(
  context: BrowserContext,
  csrfToken: string,
  name: string,
  text: string
): Promise<SavedDesign> {
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
            fabricJson: { objects: [{ type: 'i-text', text, left: 50, top: 50 }] },
            isUsed: true,
            layerCount: 1,
          },
        },
      },
    },
  });
  expect(created.status(), await created.text()).toBe(201);
  return (await created.json()) as SavedDesign;
}

test.describe('Reopen a saved design @comprehensive @app', () => {
  test('first save lands on the edit page without a 404, and a reload keeps the design', async ({
    browser,
  }) => {
    const designName = `Reopen ${Date.now()}`;
    const { context } = await newCustomer(browser, 'Save');
    try {
      const page = await context.newPage();
      await page.goto(`/dashboard/design/new/${TEE_PRODUCT_ID}`);
      await page.getByLabel('Design name').fill(designName);

      const created = page.waitForResponse(
        (r) => r.url().endsWith('/v1/designs') && r.request().method() === 'POST'
      );
      await page.getByRole('button', { name: 'Save', exact: true }).click();
      const saved = (await (await created).json()) as SavedDesign;

      // After the first save the customer is on the edit page, in the editor, not on a 404.
      await expect(page).toHaveURL(new RegExp(`/dashboard/design/${saved.id}/edit$`));
      await expect(page.getByLabel('Design name')).toHaveValue(designName);
      await expect(
        page.getByRole('heading', { name: /this page could not be found/i })
      ).toHaveCount(0);

      await page.reload();
      await expect(page.getByLabel('Design name')).toHaveValue(designName);
      await expect(page.getByRole('button', { name: 'Add to canvas' })).toBeVisible();
    } finally {
      await context.close();
    }
  });

  test('a design with a layer opens on a direct load and again after a reload', async ({
    browser,
  }) => {
    const stamp = Date.now();
    const designName = `Reopen layer ${stamp}`;
    const layerText = `Layer ${stamp}`;
    const { context, csrfToken } = await newCustomer(browser, 'Layer');
    try {
      const design = await createDesignThroughApi(context, csrfToken, designName, layerText);
      const page = await context.newPage();

      for (const reload of [false, true]) {
        const received = page.waitForResponse(
          (r) => r.url().endsWith(`/v1/designs/${design.id}`) && r.request().method() === 'GET'
        );
        if (reload) {
          await page.reload();
        } else {
          await page.goto(`/dashboard/design/${design.id}/edit`);
        }
        const opened = (await (await received).json()) as SavedDesign;
        expect(layerTexts(opened)).toEqual([layerText]);
        await expect(page.getByLabel('Design name')).toHaveValue(designName);
      }
    } finally {
      await context.close();
    }
  });

  test('an unknown design shows a not found message with a way back', async ({ browser }) => {
    const { context } = await newCustomer(browser, 'Missing');
    try {
      const page = await context.newPage();
      await page.goto('/dashboard/design/00000000-0000-4000-8000-000000000000/edit');
      await expect(page.getByRole('heading', { name: 'Design not found' })).toBeVisible();
      await page.getByRole('link', { name: 'Back to Design Workshop' }).click();
      await expect(page).toHaveURL(/\/dashboard\/design$/);
    } finally {
      await context.close();
    }
  });

  test("another customer's design shows the same not found message", async ({ browser }) => {
    const owner = await newCustomer(browser, 'Owner');
    const other = await newCustomer(browser, 'Other');
    try {
      const design = await createDesignThroughApi(
        owner.context,
        owner.csrfToken,
        `Private ${Date.now()}`,
        'Secret'
      );
      const page = await other.context.newPage();
      await page.goto(`/dashboard/design/${design.id}/edit`);
      await expect(page.getByRole('heading', { name: 'Design not found' })).toBeVisible();
      await expect(page.getByLabel('Design name')).toHaveCount(0);
    } finally {
      await owner.context.close();
      await other.context.close();
    }
  });
});
