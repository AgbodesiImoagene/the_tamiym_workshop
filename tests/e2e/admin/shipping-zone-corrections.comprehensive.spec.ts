import path from 'node:path';
import { expect, type APIRequestContext } from '@playwright/test';
import { attachStrictPageGuards, authDir, test as base, urls } from '../fixtures/test';
import {
  addZoneArea,
  addZoneRate,
  createAdminApi,
  createShippingZone,
  deleteShippingZone,
  listZoneAreas,
  listZoneRates,
  stateCodeByName,
  type TestShippingZone,
} from '../fixtures/admin-api';

/**
 * TTW-097: an admin corrects a rate, removes a state from a zone and deletes a
 * rate from the screen, against the real API and database.
 *
 * Each zone has a name unique to this worker and run and is removed afterwards.
 * The coverage warning needs a state no other zone covers: Kebbi is not used by
 * the seed or by any other spec.
 */
const test = base.extend<{ admin: APIRequestContext; zone: TestShippingZone }>({
  admin: async ({}, use) => {
    const admin = await createAdminApi();
    await use(admin);
    await admin.dispose();
  },
  zone: async ({ admin }, use, testInfo) => {
    const name = `TTW-097 zone w${testInfo.parallelIndex}-${Date.now()}`;
    const zone = await createShippingZone(admin, name);
    try {
      await use(zone);
    } finally {
      await deleteShippingZone(admin, zone.id);
    }
  },
});

test.describe('Admin shipping zone corrections @comprehensive @admin', () => {
  test('corrects the fee of a rate (TTW-097)', async ({ adminPage, admin, zone }) => {
    await addZoneRate(admin, zone.id, 1500);
    await adminPage.goto(`/admin/shipping/zones/${zone.id}`);

    await adminPage.getByRole('button', { name: /Edit STANDARD rate/i }).click();
    const fee = adminPage.getByLabel('Flat fee').first();
    await fee.fill('2500');
    await adminPage.getByRole('button', { name: 'Save rate' }).click();

    await expect(adminPage.getByRole('status')).toContainText('Shipping rate updated');
    const rates = await listZoneRates(admin, zone.id);
    expect(rates.map((rate) => Number(rate.flatFee))).toEqual([2500]);
  });

  test('warns, then removes a state that was the only delivery coverage (TTW-097)', async ({
    browser,
    admin,
    zone,
  }) => {
    // The 409 is the warning this test provokes; the guard allows that one request.
    const context = await browser.newContext({
      baseURL: urls.admin,
      storageState: path.join(authDir, 'admin.json'),
    });
    const adminPage = await context.newPage();
    const assertClean = attachStrictPageGuards(adminPage, {
      allowConsoleError: (message) =>
        message.text().includes('status of 409') &&
        /\/v1\/admin\/shipping-zones\/[^/]+\/areas\/[^/?]+$/.test(message.location().url),
    });
    try {
      const kebbi = await stateCodeByName(admin, 'Kebbi');
      await addZoneArea(admin, zone.id, kebbi);
      await addZoneRate(admin, zone.id, 1800);
      await adminPage.goto(`/admin/shipping/zones/${zone.id}`);

      await adminPage.getByRole('button', { name: /Remove Kebbi/i }).click();
      await adminPage.getByRole('alertdialog').getByRole('button', { name: 'Remove' }).click();

      const warning = adminPage.getByRole('alertdialog');
      await expect(warning).toContainText('Kebbi would no longer have any delivery rate');
      // Nothing was removed while the warning is up.
      expect(await listZoneAreas(admin, zone.id)).toHaveLength(1);

      await warning.getByRole('button', { name: 'Yes, continue' }).click();
      await expect(adminPage.getByRole('status')).toContainText('removed from this zone');
      expect(await listZoneAreas(admin, zone.id)).toEqual([]);
      assertClean();
    } finally {
      await context.close();
    }
  });

  test('deletes a rate after confirmation, and Cancel deletes nothing (TTW-097)', async ({
    adminPage,
    admin,
    zone,
  }) => {
    await addZoneRate(admin, zone.id, 900);
    await adminPage.goto(`/admin/shipping/zones/${zone.id}`);

    await adminPage.getByRole('button', { name: /Delete STANDARD rate/i }).click();
    await adminPage.getByRole('alertdialog').getByRole('button', { name: 'Cancel' }).click();
    expect(await listZoneRates(admin, zone.id)).toHaveLength(1);

    await adminPage.getByRole('button', { name: /Delete STANDARD rate/i }).click();
    await adminPage.getByRole('alertdialog').getByRole('button', { name: 'Delete rate' }).click();
    await expect(adminPage.getByRole('status')).toContainText('Shipping rate deleted');
    expect(await listZoneRates(admin, zone.id)).toEqual([]);
  });
});
