import type { Page } from '@playwright/test';
import { test, expect } from '../fixtures/test';

/**
 * TTW-106: an admin takes a paid order (the seeded PROCESSING order) to delivered
 * from the order page, and the customer sees the timeline on their own order page.
 *
 * The test changes that order for good, so it needs a database where the seed has
 * not been used by another run (see the throwaway-database note in AGENTS.md).
 */
const ORDER_ID = 'e2e-order-processing';

/**
 * That seeded order also shows its print files (another ticket). The seed has no object
 * in storage, so the on-screen preview of its upload would answer an error and trip the
 * clean-page guard. A 1 px PNG stands in for that preview only, as the print-files spec
 * does; the shipment calls under test all go to the real API.
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

test.describe('Admin shipment journey @journey @admin @critical', () => {
  test.describe.configure({ mode: 'serial' });

  test('the status list no longer offers fulfilled or delivered', async ({ adminPage }) => {
    await standInForStoredPreview(adminPage);
    await adminPage.goto(`/admin/orders/${ORDER_ID}`);
    await expect(adminPage.getByRole('heading', { name: /Order detail/i })).toBeVisible();
    // The heading shows before the order loads: wait for the select itself.
    await expect(adminPage.locator('#status')).toBeVisible();
    const options = await adminPage.locator('#status option').allTextContents();
    expect(options.map((o) => o.toUpperCase())).toEqual(['PROCESSING', 'CANCELLED']);
  });

  test('create a shipment, mark it shipped, then delivered', async ({ adminPage }) => {
    await standInForStoredPreview(adminPage);
    await adminPage.goto(`/admin/orders/${ORDER_ID}`);
    const panel = adminPage.getByTestId('admin-shipments');

    await panel.getByLabel('Carrier').selectOption('MANUAL');
    await panel.getByRole('button', { name: 'Create shipment' }).click();
    await expect(panel.getByRole('status')).toHaveText('Shipment created.');
    await expect(adminPage.getByTestId('admin-order-status')).toContainText(/fulfilled/i);

    await panel.getByRole('button', { name: 'Mark as shipped' }).click();
    // A tracking number is required to ship: the confirm button stays disabled without it.
    await expect(panel.getByRole('button', { name: 'Confirm' })).toBeDisabled();
    await panel.getByLabel('Tracking number').fill('TTW106-TRACK-1');
    await panel.getByLabel('Message to the customer (optional)').fill('Handed to the courier.');
    await panel.getByRole('button', { name: 'Confirm' }).click();
    await expect(panel.getByRole('status')).toHaveText('Shipment updated: dispatched.');

    await panel.getByRole('button', { name: 'Mark as delivered' }).click();
    await panel.getByRole('button', { name: 'Confirm' }).click();
    await expect(panel.getByRole('status')).toHaveText('Shipment updated: delivered.');

    await expect(panel.getByText('This shipment is closed.')).toBeVisible();
    const history = panel.getByRole('list', { name: 'Shipment history' });
    await expect(history.getByRole('listitem')).toHaveCount(3);
    await expect(adminPage.getByTestId('admin-order-status')).toContainText(/delivered/i);
  });

  test('the customer sees the shipment timeline on the order page', async ({ customerPage }) => {
    await customerPage.goto(`/dashboard/orders/${ORDER_ID}`);
    await expect(customerPage.getByText('TTW106-TRACK-1').first()).toBeVisible();
    await expect(customerPage.getByText('Handed to the courier.')).toBeVisible();
  });
});
