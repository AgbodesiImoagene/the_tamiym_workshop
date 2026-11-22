import path from 'node:path';
import { attachStrictPageGuards, authDir, expect, test, urls } from '../fixtures/test';

/**
 * TTW-106: the unhappy paths of the admin shipment panel, on the seeded FULFILLED
 * order (the happy path uses the PROCESSING one). A refused request must show an
 * error and leave the shipment where it was, and a reported problem must show
 * its code and reach the history. The test changes that order for good, so it
 * needs a database where the seed has not been used by another run.
 */
const ORDER_ID = 'e2e-order-fulfilled';

test.describe('Admin shipment problems @journey @admin @critical', () => {
  test.describe.configure({ mode: 'serial' });

  test('a refused tracking link shows an error and keeps the shipment READY', async ({
    browser,
  }) => {
    const context = await browser.newContext({
      baseURL: urls.admin,
      storageState: path.join(authDir, 'admin.json'),
    });
    const page = await context.newPage();
    // The 400 below is provoked on purpose: only that exact browser line is allowed.
    const assertClean = attachStrictPageGuards(page, {
      allowConsoleError: (msg) =>
        msg.text().includes('Failed to load resource') && msg.text().includes('400'),
    });

    await page.goto(`/admin/orders/${ORDER_ID}`);
    const panel = page.getByTestId('admin-shipments');
    await panel.getByRole('button', { name: 'Create shipment' }).click();
    await expect(panel.getByRole('status')).toHaveText('Shipment created.');

    await panel.getByRole('button', { name: 'Mark as shipped' }).click();
    await panel.getByLabel('Tracking number').fill('TTW106-BAD-LINK');
    await panel
      .getByLabel('Tracking link (optional)')
      .fill('https://not-a-carrier.example.com/t/1');
    await panel.getByRole('button', { name: 'Confirm' }).click();

    await expect(panel.getByRole('alert')).toContainText(/allowlist/i);
    // Nothing moved: still READY, with the form open so the admin can fix the link.
    await expect(panel.getByTestId('admin-shipment')).toContainText(/ready/i);
    await expect(panel.getByRole('button', { name: 'Confirm' })).toBeVisible();

    // Fixing the link and retrying works.
    await panel.getByLabel('Tracking link (optional)').fill('https://www.ups.com/track?loc=en_US');
    await panel.getByRole('button', { name: 'Confirm' }).click();
    await expect(panel.getByRole('status')).toHaveText('Shipment updated: dispatched.');

    assertClean();
    await context.close();
  });

  test('report a problem shows the code and adds it to the history', async ({ adminPage }) => {
    await adminPage.goto(`/admin/orders/${ORDER_ID}`);
    const panel = adminPage.getByTestId('admin-shipments');

    await panel.getByRole('button', { name: 'Report a problem' }).click();
    await panel.getByLabel('Problem').selectOption('DAMAGED');
    await panel.getByLabel('Message to the customer (optional)').fill('The parcel was damaged.');
    await panel.getByRole('button', { name: 'Confirm' }).click();

    await expect(panel.getByRole('status')).toHaveText('Shipment updated: exception.');
    await expect(panel.getByText('Problem reported: damaged')).toBeVisible();
    const history = panel.getByRole('list', { name: 'Shipment history' });
    await expect(history.getByRole('listitem').last()).toContainText(/exception/i);
    await expect(history.getByRole('listitem').last()).toContainText('The parcel was damaged.');
    // The order is not cancelled or refunded by a problem (TTW-040 / TTW-041).
    await expect(adminPage.getByTestId('admin-order-status')).toContainText(/fulfilled/i);
  });

  test('after a problem the admin can still deliver, and the order is delivered', async ({
    adminPage,
  }) => {
    await adminPage.goto(`/admin/orders/${ORDER_ID}`);
    const panel = adminPage.getByTestId('admin-shipments');

    await panel.getByRole('button', { name: 'Mark as delivered' }).click();
    await panel.getByRole('button', { name: 'Confirm' }).click();
    await expect(panel.getByRole('status')).toHaveText('Shipment updated: delivered.');
    await expect(adminPage.getByTestId('admin-order-status')).toContainText(/delivered/i);
  });
});
