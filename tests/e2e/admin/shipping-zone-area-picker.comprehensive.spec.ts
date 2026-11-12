import { expect, type Page } from '@playwright/test';
import { test } from '../fixtures/test';

const ZONE_ID = 'zone-ttw-201';

const STATES = [
  { code: 'AB', name: 'Abia', isActive: true },
  { code: 'LA', name: 'Lagos', isActive: false },
  { code: 'FC', name: 'Abuja', isActive: true },
];

const LGAS = [
  { id: 'lga-garki', stateCode: 'FC', name: 'Garki', isActive: true },
  { id: 'lga-wuse', stateCode: 'FC', name: 'Wuse', isActive: false },
];

/**
 * Serves the zone and the geo lists from fixtures, so the test depends on no
 * shared seed data, and records every area the page tries to create.
 */
async function mockZonePage(page: Page): Promise<string[]> {
  const areaWrites: string[] = [];
  await page.route(`**/v1/admin/shipping-zones/${ZONE_ID}`, (route) =>
    route.fulfill({
      json: {
        id: ZONE_ID,
        name: 'TTW-201 zone',
        isActive: true,
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
        areas: [],
        rules: [],
        rates: [],
      },
    })
  );
  await page.route(`**/v1/admin/shipping-zones/${ZONE_ID}/areas`, (route) => {
    areaWrites.push(route.request().postData() ?? '');
    return route.fulfill({ status: 500, json: { message: 'must not be called' } });
  });
  await page.route('**/v1/admin/geo/states', (route) => route.fulfill({ json: STATES }));
  await page.route('**/v1/admin/geo/states/*/lgas', (route) => route.fulfill({ json: LGAS }));
  return areaWrites;
}

test.describe('Admin zone area picker @comprehensive @admin', () => {
  test('marks a deactivated state and does not let it be chosen (TTW-201)', async ({
    adminPage,
  }) => {
    const areaWrites = await mockZonePage(adminPage);
    await adminPage.goto(`/admin/shipping/zones/${ZONE_ID}`);

    const stateTrigger = adminPage.locator('#stateCode');
    await stateTrigger.click();

    const deactivated = adminPage.getByRole('option', { name: 'Lagos (deactivated)' });
    await expect(deactivated).toBeVisible();
    await expect(deactivated).toHaveAttribute('aria-disabled', 'true');
    // Active states keep their plain name and stay selectable.
    await expect(adminPage.getByRole('option', { name: 'Abia', exact: true })).not.toHaveAttribute(
      'aria-disabled',
      'true'
    );

    await deactivated.click({ force: true });
    await adminPage.keyboard.press('Escape');
    await expect(stateTrigger).toContainText('Select state');
    await expect(adminPage.getByRole('button', { name: /Add coverage area/i })).toBeDisabled();
    expect(areaWrites).toEqual([]);
  });

  test('marks a deactivated LGA and does not let it be chosen (TTW-201)', async ({ adminPage }) => {
    const areaWrites = await mockZonePage(adminPage);
    await adminPage.goto(`/admin/shipping/zones/${ZONE_ID}`);

    await adminPage.locator('#stateCode').click();
    await adminPage.getByRole('option', { name: 'Abuja', exact: true }).click();

    const lgaTrigger = adminPage.locator('#lgaId');
    await expect(lgaTrigger).toBeEnabled();
    await lgaTrigger.click();

    const deactivated = adminPage.getByRole('option', { name: 'Wuse (deactivated)' });
    await expect(deactivated).toBeVisible();
    await expect(deactivated).toHaveAttribute('aria-disabled', 'true');
    await expect(adminPage.getByRole('option', { name: 'Garki', exact: true })).not.toHaveAttribute(
      'aria-disabled',
      'true'
    );

    await deactivated.click({ force: true });
    await adminPage.keyboard.press('Escape');
    await expect(lgaTrigger).toContainText('All LGAs in state');
    expect(areaWrites).toEqual([]);
  });
});
