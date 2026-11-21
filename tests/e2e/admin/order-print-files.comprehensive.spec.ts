import { expect, type Page } from '@playwright/test';
import { test } from '../fixtures/test';
import { assertVisibleControlsEnabled } from '../fixtures/interactions';
import { describeViewportMatrix } from '../fixtures/viewport-suite';
import { E2E_ORDER_PAID_ID, E2E_ORDER_PROCESSING_ID } from '../fixtures/seed-data';

/**
 * The local seed has no object in storage, so the on-screen rendition of the seeded upload
 * would answer 404. A 1 px PNG stands in for the stored file; the order, the layers and the
 * link request still come from the real API.
 */
const ONE_PIXEL_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
  'base64'
);

async function standInForStoredPreview(page: Page) {
  await page.route('**/design-assets/*/file*', (route) =>
    route.fulfill({ status: 200, contentType: 'image/png', body: ONE_PIXEL_PNG })
  );
}

describeViewportMatrix('Admin order print files @comprehensive @admin @critical', () => {
  test('an ordered design shows all its sides, positions and original files', async ({
    adminPage,
  }) => {
    await standInForStoredPreview(adminPage);
    await adminPage.goto(`/admin/orders/${E2E_ORDER_PROCESSING_ID}`);
    await expect(adminPage.getByRole('heading', { name: /Order detail/i })).toBeVisible();

    const printFiles = adminPage.getByTestId('print-files');
    await expect(printFiles).toBeVisible();
    await expect(printFiles).toContainText('Frozen Choir Artwork');

    const front = adminPage.getByTestId('print-side-front');
    const back = adminPage.getByTestId('print-side-back');
    await expect(front.getByRole('heading', { name: 'Front' })).toBeVisible();
    await expect(back.getByRole('heading', { name: 'Back' })).toBeVisible();
    await expect(
      front.getByRole('img', { name: /Layout preview of the Front side/i })
    ).toBeVisible();
    await expect(back.getByRole('img', { name: /Layout preview of the Back side/i })).toBeVisible();

    // Positions and sizes, text and image layers.
    await expect(front).toContainText('Text: “Choir Tour 2026”');
    await expect(front).toContainText('x 40, y 30 · 200 × 150 px');
    await expect(back).toContainText('Text: “Sing Loud”');
    await expect(back).toContainText('turned 10°');
    await expect(back).toContainText('No print area is set for this side.');

    await assertVisibleControlsEnabled(adminPage.locator('main'));
  });

  test('the original file opens through a fresh signed link', async ({ adminPage }) => {
    await standInForStoredPreview(adminPage);
    await adminPage.route('**/design-assets/*/link*', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          url: 'https://storage.example.test/signed-original.png',
          expiresInSeconds: 300,
        }),
      })
    );
    // The link is opened in a new tab: stop it, we only check that it was asked for.
    await adminPage.addInitScript(() => {
      (window as unknown as { __opened: string[] }).__opened = [];
      HTMLAnchorElement.prototype.click = function click(this: HTMLAnchorElement) {
        (window as unknown as { __opened: string[] }).__opened.push(this.href);
      };
    });
    await adminPage.goto(`/admin/orders/${E2E_ORDER_PROCESSING_ID}`);

    const linkRequest = adminPage.waitForRequest(
      (request) =>
        /\/design-assets\/[^/]+\/link\?variant=original/.test(request.url()) &&
        request.method() === 'GET'
    );
    await adminPage.getByRole('button', { name: 'Open original file' }).click();
    await linkRequest;

    await expect
      .poll(() => adminPage.evaluate(() => (window as unknown as { __opened: string[] }).__opened))
      .toEqual(['https://storage.example.test/signed-original.png']);
  });

  test('an item with no recorded design says so', async ({ adminPage }) => {
    await adminPage.goto(`/admin/orders/${E2E_ORDER_PAID_ID}`);
    await expect(adminPage.getByRole('heading', { name: /Order detail/i })).toBeVisible();
    await expect(adminPage.getByTestId('print-files')).toHaveCount(0);
  });
});
