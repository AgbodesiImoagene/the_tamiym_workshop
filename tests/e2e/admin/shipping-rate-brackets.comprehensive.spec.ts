import { expect, type APIRequestContext } from '@playwright/test';
import { apiLogin, createApiContext } from '../fixtures/api';
import {
  addZoneArea,
  addZoneRate,
  createAdminApi,
  createShippingZone,
  deleteShippingZone,
  listZoneRates,
  stateCodeByName,
  type TestShippingZone,
} from '../fixtures/admin-api';
import { e2eUsers } from '../fixtures/identities';
import { test as base } from '../fixtures/test';

/**
 * TTW-098: an admin makes a rate depend on the number of items from the
 * screen, and a shopper with a larger order is quoted a higher delivery fee.
 * Real API and database; the quote is read as the shopper would.
 *
 * The zone is thrown away after the test and covers Yobe, a state seeded for
 * this spec alone, so no other spec's coverage changes.
 */
const TEE_WHITE_LARGE_VARIANT_ID = 'e2e-variant-tee-white-l';

const test = base.extend<{ admin: APIRequestContext; zone: TestShippingZone }>({
  admin: async ({}, use) => {
    const admin = await createAdminApi();
    await use(admin);
    await admin.dispose();
  },
  zone: async ({ admin }, use, testInfo) => {
    const name = `TTW-098 zone w${testInfo.parallelIndex}-${Date.now()}`;
    const zone = await createShippingZone(admin, name);
    try {
      await use(zone);
    } finally {
      await deleteShippingZone(admin, zone.id);
    }
  },
});

async function shippingFeeFor(
  customerApi: APIRequestContext,
  csrfToken: string,
  addressId: string,
  quantity: number
) {
  const res = await customerApi.post('orders/quote', {
    headers: { 'x-csrf-token': csrfToken },
    data: {
      shippingAddressId: addressId,
      items: [{ variantId: TEE_WHITE_LARGE_VARIANT_ID, quantity }],
    },
  });
  expect(res.ok(), await res.text()).toBe(true);
  return Number(((await res.json()) as { shippingFee: number | string }).shippingFee);
}

test.describe('Admin shipping rate brackets @comprehensive @admin', () => {
  test('an admin sets a bracket by items and a larger order pays more (TTW-098)', async ({
    adminPage,
    admin,
    zone,
  }) => {
    await addZoneArea(admin, zone.id, await stateCodeByName(admin, 'Yobe'));
    await addZoneRate(admin, zone.id, 1500);

    const customerApi = await createApiContext('CUSTOMER');
    let addressId: string | null = null;
    let csrf = '';
    try {
      const { csrfToken } = await apiLogin(
        customerApi,
        e2eUsers.customer.email,
        e2eUsers.customer.password,
        'CUSTOMER'
      );
      csrf = csrfToken;
      const created = await customerApi.post('users/addresses', {
        headers: { 'x-csrf-token': csrfToken },
        data: {
          addressLine1: '1 Bracket Road',
          city: 'Damaturu',
          state: 'Yobe',
          stateCode: 'YO',
          country: 'Nigeria',
          isDefault: false,
        },
      });
      expect(created.status(), await created.text()).toBe(201);
      addressId = ((await created.json()) as { id: string }).id;

      // Before: one item or five items, the same fee.
      expect(await shippingFeeFor(customerApi, csrfToken, addressId, 1)).toBe(1500);
      expect(await shippingFeeFor(customerApi, csrfToken, addressId, 5)).toBe(1500);

      await adminPage.goto(`/admin/shipping/zones/${zone.id}`);
      await adminPage.getByRole('button', { name: /Edit STANDARD rate/i }).click();
      await adminPage.getByRole('combobox', { name: 'Fee depends on' }).click();
      await adminPage.getByRole('option', { name: 'By number of items' }).click();
      await adminPage.getByRole('button', { name: 'Add bracket' }).click();
      await adminPage.getByLabel('From (items)').fill('5');
      await adminPage.getByLabel('Fee from here').fill('4000');
      await adminPage.getByRole('button', { name: 'Save rate' }).click();
      await expect(adminPage.getByRole('status')).toContainText('Shipping rate updated');

      // The bracket is stored, shown on the rate, and used by the quote.
      await expect(adminPage.getByRole('list', { name: 'STANDARD brackets' })).toContainText(
        'From 5 items'
      );
      const [rate] = await listZoneRates(admin, zone.id);
      expect(rate).toMatchObject({ bracketBasis: 'QUANTITY' });
      expect(await shippingFeeFor(customerApi, csrfToken, addressId, 1)).toBe(1500);
      expect(await shippingFeeFor(customerApi, csrfToken, addressId, 5)).toBe(4000);

      // Back to a flat fee: the larger order pays the flat fee again.
      await adminPage.getByRole('button', { name: /Edit STANDARD rate/i }).click();
      await adminPage.getByRole('combobox', { name: 'Fee depends on' }).click();
      await adminPage.getByRole('option', { name: 'Flat fee only' }).click();
      await adminPage.getByRole('button', { name: 'Save rate' }).click();
      await expect(adminPage.getByRole('list', { name: 'STANDARD brackets' })).toHaveCount(0);
      expect(await shippingFeeFor(customerApi, csrfToken, addressId, 5)).toBe(1500);
    } finally {
      if (addressId) {
        await customerApi.delete(`users/addresses/${addressId}`, {
          headers: { 'x-csrf-token': csrf },
        });
      }
      await customerApi.dispose();
    }
  });

  test('refuses an incomplete bracket and saves nothing (TTW-098)', async ({
    adminPage,
    admin,
    zone,
  }) => {
    await addZoneRate(admin, zone.id, 1500);
    await adminPage.goto(`/admin/shipping/zones/${zone.id}`);

    await adminPage.getByRole('button', { name: /Edit STANDARD rate/i }).click();
    await adminPage.getByRole('combobox', { name: 'Fee depends on' }).click();
    await adminPage.getByRole('option', { name: 'By total weight' }).click();
    await adminPage.getByRole('button', { name: 'Add bracket' }).click();
    await adminPage.getByLabel('From (g)').fill('5000');
    await adminPage.getByRole('button', { name: 'Save rate' }).click();

    await expect(
      adminPage.getByRole('alert').filter({ hasText: 'Fill in every bracket.' })
    ).toBeVisible();
    const [rate] = await listZoneRates(admin, zone.id);
    expect(rate).not.toMatchObject({ bracketBasis: 'WEIGHT_GRAMS' });
  });
});
