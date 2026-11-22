import { expect, type Page } from '@playwright/test';
import { test } from '../fixtures/test';
import { assertVisibleControlsEnabled } from '../fixtures/interactions';
import { describeViewportMatrix } from '../fixtures/viewport-suite';
import {
  E2E_ORDER_PAID_ID,
  E2E_ORDER_PENDING_ID,
  E2E_ORDER_PROCESSING_ID,
} from '../fixtures/seed-data';

/**
 * The local seed has no object in storage, so the on-screen rendition of the seeded upload
 * would answer 404. A 1 px PNG stands in for the stored bytes of that preview only; the
 * order, the layers and the signed-link request come from the real API.
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
    // The link comes from the real API. The new tab is replaced by a stub window, so we can
    // read where it was sent without leaving the page.
    await adminPage.addInitScript(() => {
      const stub = { opener: 'unset', closed: false, location: { href: '' }, close() {} };
      (window as unknown as { __tab: typeof stub }).__tab = stub;
      window.open = () => stub as unknown as Window;
    });
    await adminPage.goto(`/admin/orders/${E2E_ORDER_PROCESSING_ID}`);

    const linkResponse = adminPage.waitForResponse(
      (response) =>
        /\/design-assets\/[^/]+\/link\?variant=original/.test(response.url()) &&
        response.request().method() === 'GET'
    );
    await adminPage.getByRole('button', { name: 'Open original file' }).click();
    expect((await linkResponse).status()).toBe(200);

    const sentTo = await adminPage.evaluate(
      () => (window as unknown as { __tab: { location: { href: string } } }).__tab.location.href
    );
    const link = new URL(sentTo);
    // Signed for the private bucket and the stored object of the seeded upload.
    expect(link.pathname).toContain('e2e/media/print/original.png');
    expect(link.searchParams.get('X-Amz-Signature')).toBeTruthy();
    expect(Number(link.searchParams.get('X-Amz-Expires'))).toBeLessThanOrEqual(900);
    expect(
      await adminPage.evaluate(
        () => (window as unknown as { __tab: { opener: unknown } }).__tab.opener
      )
    ).toBeNull();
  });

  test('an item with a design but no frozen copy says so instead of reading the live design', async ({
    adminPage,
  }) => {
    await adminPage.goto(`/admin/orders/${E2E_ORDER_PENDING_ID}`);
    await expect(adminPage.getByRole('heading', { name: /Order detail/i })).toBeVisible();
    await expect(adminPage.getByTestId('print-files-missing')).toHaveText(
      'Print files were not recorded for this item.'
    );
    await expect(adminPage.getByTestId('print-files')).toHaveCount(0);
  });

  test('an item with no design shows no print files section', async ({ adminPage }) => {
    await adminPage.goto(`/admin/orders/${E2E_ORDER_PAID_ID}`);
    await expect(adminPage.getByRole('heading', { name: /Order detail/i })).toBeVisible();
    await expect(adminPage.getByTestId('print-files')).toHaveCount(0);
  });
});
