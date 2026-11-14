import { expect, type APIRequestContext, type Page } from '@playwright/test';
import { test as base } from '../fixtures/test';
import {
  createAdminApi,
  createShippingZone,
  deleteShippingZone,
  listZoneAreas,
  type TestShippingZone,
} from '../fixtures/admin-api';
import {
  E2E_ACTIVE_LGA_NAME,
  E2E_ACTIVE_STATE_NAME,
  E2E_DORMANT_LGA_NAME,
  E2E_DORMANT_STATE_NAME,
} from '../fixtures/seed-data';

/**
 * TTW-201 picker behaviour, run against the real API and database (TTW-209).
 *
 * - The zone is created through `POST /admin/shipping-zones`, with a name that
 *   is unique to this worker and run, and removed afterwards.
 * - The geo lists come from the real admin routes. The deactivated state and
 *   LGA are inactive rows from `seed:e2e`: no admin route deactivates a state,
 *   and inactive rows never reach the public geo lists other specs count.
 */
const test = base.extend<{ admin: APIRequestContext; zone: TestShippingZone }>({
  admin: async ({}, use) => {
    const admin = await createAdminApi();
    await use(admin);
    await admin.dispose();
  },
  zone: async ({ admin }, use, testInfo) => {
    const name = `TTW-209 picker zone w${testInfo.parallelIndex}-${Date.now()}`;
    const zone = await createShippingZone(admin, name);
    try {
      await use(zone);
    } finally {
      await deleteShippingZone(admin, zone.id);
    }
  },
});

/** Every request the page sends to create a coverage area. */
function recordAreaWrites(page: Page): string[] {
  const writes: string[] = [];
  page.on('request', (request) => {
    if (
      request.method() === 'POST' &&
      /\/v1\/admin\/shipping-zones\/[^/]+\/areas$/.test(request.url())
    ) {
      writes.push(request.postData() ?? '');
    }
  });
  return writes;
}

test.describe('Admin zone area picker @comprehensive @admin', () => {
  test('marks a deactivated state and does not let it be chosen (TTW-201)', async ({
    adminPage,
    admin,
    zone,
  }) => {
    const areaWrites = recordAreaWrites(adminPage);
    await adminPage.goto(`/admin/shipping/zones/${zone.id}`);
    await expect(adminPage.getByText(zone.name, { exact: true })).toBeVisible();

    const stateTrigger = adminPage.locator('#stateCode');
    await stateTrigger.click();

    const deactivated = adminPage.getByRole('option', {
      name: `${E2E_DORMANT_STATE_NAME} (deactivated)`,
    });
    await expect(deactivated).toBeVisible();
    await expect(deactivated).toHaveAttribute('aria-disabled', 'true');
    // Active states keep their plain name and stay selectable.
    await expect(
      adminPage.getByRole('option', { name: E2E_ACTIVE_STATE_NAME, exact: true })
    ).not.toHaveAttribute('aria-disabled', 'true');

    await deactivated.click({ force: true });
    await adminPage.keyboard.press('Escape');
    await expect(stateTrigger).toContainText('Select state');
    await expect(adminPage.getByRole('button', { name: /Add coverage area/i })).toBeDisabled();
    expect(areaWrites).toEqual([]);
    expect(await listZoneAreas(admin, zone.id)).toEqual([]);
  });

  test('marks a deactivated LGA and does not let it be chosen (TTW-201)', async ({
    adminPage,
    admin,
    zone,
  }) => {
    const areaWrites = recordAreaWrites(adminPage);
    await adminPage.goto(`/admin/shipping/zones/${zone.id}`);
    await expect(adminPage.getByText(zone.name, { exact: true })).toBeVisible();

    await adminPage.locator('#stateCode').click();
    await adminPage.getByRole('option', { name: E2E_ACTIVE_STATE_NAME, exact: true }).click();

    const lgaTrigger = adminPage.locator('#lgaId');
    await expect(lgaTrigger).toBeEnabled();
    await lgaTrigger.click();

    const deactivated = adminPage.getByRole('option', {
      name: `${E2E_DORMANT_LGA_NAME} (deactivated)`,
    });
    await expect(deactivated).toBeVisible();
    await expect(deactivated).toHaveAttribute('aria-disabled', 'true');
    await expect(
      adminPage.getByRole('option', { name: E2E_ACTIVE_LGA_NAME, exact: true })
    ).not.toHaveAttribute('aria-disabled', 'true');

    await deactivated.click({ force: true });
    await adminPage.keyboard.press('Escape');
    await expect(lgaTrigger).toContainText('All LGAs in state');
    expect(areaWrites).toEqual([]);
    expect(await listZoneAreas(admin, zone.id)).toEqual([]);
  });
});
