import { expect, type APIRequestContext, type Page } from '@playwright/test';
import { test } from '../fixtures/test';
import { describeViewportMatrix } from '../fixtures/viewport-suite';
import {
  createAdminApi,
  readSiteSettings,
  restoreSiteSettings,
  type SiteSettingsValues,
} from '../fixtures/admin-api';
import { openSiteSettings, SITE_SETTINGS_API } from '../admin/site-settings-helpers';

/**
 * Real save of the site settings (TTW-211). The PATCH goes to the real API.
 *
 * Site settings are one global row that checkout (VAT) and payout specs read.
 * This spec writes 0 %, 7.55 % and 100 % VAT, so it must never overlap with
 * those specs:
 * - it lives in the `chromium-admin-settings-writes` project, which only starts
 *   once the web, app, admin and journey projects have finished;
 * - that project is not fully parallel, so the three viewport runs below take
 *   turns on the row instead of racing;
 * - each test restores the row it found in `afterEach`, even when it fails.
 */
let admin: APIRequestContext;
let original: SiteSettingsValues | undefined;

test.beforeAll(async () => {
  admin = await createAdminApi();
});

test.afterAll(async () => {
  await admin?.dispose();
});

test.beforeEach(async () => {
  original = await readSiteSettings(admin);
  // Refuse a corrupted starting row: it would be taken as the reference and
  // "restored" as is, hiding the damage from the next test and from the readers.
  expect(original.vatRate, 'the settings row starts with a VAT fraction').toBeGreaterThanOrEqual(0);
  expect(original.vatRate, 'the settings row starts with a VAT fraction').toBeLessThanOrEqual(1);
});

test.afterEach(async () => {
  // beforeAll/beforeEach failed: nothing was read, so nothing was changed.
  if (!admin || !original) return;
  await restoreSiteSettings(admin, original);
  // The restore must have landed: other specs read this row.
  expect(await readSiteSettings(admin)).toEqual(original);
});

/** Clicks Save and waits for the real API to answer the PATCH. */
async function save(page: Page, saveButton: ReturnType<Page['getByRole']>) {
  const [response] = await Promise.all([
    page.waitForResponse(
      (res) => res.request().method() === 'PATCH' && res.url().endsWith('/v1/admin/site-settings')
    ),
    saveButton.click(),
  ]);
  expect(response.status()).toBe(200);
  return {
    body: response.request().postDataJSON() as Record<string, unknown>,
    saved: (await response.json()) as Record<string, unknown>,
  };
}

describeViewportMatrix('Admin site settings save (real API) @comprehensive @admin', () => {
  test('site settings save the VAT rate as a fraction with the other fields (TTW-183)', async ({
    adminPage,
  }) => {
    // Nothing intercepts the PATCH: this guards the spec against becoming a stub again.
    const routed: string[] = [];
    await adminPage.route(SITE_SETTINGS_API, (route) => {
      routed.push(route.request().method());
      return route.fallback();
    });
    const { saveButton, resetButton, vatRate } = await openSiteSettings(adminPage);
    await expect(saveButton).toBeDisabled();
    await expect(resetButton).toBeDisabled();

    // Every field reaches the request: a checkbox, a select, and a blank minimum.
    const pricesIncludeVat = adminPage.getByRole('checkbox', { name: /Prices include VAT/i });
    const pricesIncludedBefore = await pricesIncludeVat.isChecked();
    await pricesIncludeVat.click();
    const payoutMode = adminPage.locator('#payoutMode');
    // AUTO_EXECUTE is refused by the real API while PAYOUT_AUTO_EXECUTE_ENABLED is off.
    const nextMode = (await payoutMode.innerText()).includes('MANUAL')
      ? 'AUTO_APPROVAL_REQUIRED'
      : 'MANUAL';
    await payoutMode.click();
    await adminPage.getByRole('option', { name: nextMode.replaceAll('_', ' ') }).click();
    await adminPage.getByLabel('Minimum payout amount').fill('');
    await adminPage.getByLabel('Payout cadence (days)').fill('14');
    await vatRate.fill('7.55');
    const first = await save(adminPage, saveButton);

    await expect(adminPage.getByText('Site settings saved.')).toBeVisible();
    expect(first.body).toEqual({
      vatRate: 0.0755,
      pricesIncludeVat: !pricesIncludedBefore,
      vatAppliesToShipping: expect.any(Boolean),
      currency: expect.any(String),
      payoutMode: nextMode,
      payoutCadenceDays: 14,
      payoutSettlementHoldDays: expect.any(Number),
      minimumPayoutAmount: null,
      autoRetryFailedPayouts: expect.any(Boolean),
    });
    // The real API stored it: the answer and a fresh read carry the saved values.
    expect(first.saved).toMatchObject(first.body);
    expect(await readSiteSettings(admin)).toEqual(first.body);

    // Boundaries: 100 % and an explicitly typed 0 % are both accepted.
    for (const [typed, sent] of [
      ['100', 1],
      ['0', 0],
    ] as const) {
      await expect(saveButton).toBeDisabled();
      await vatRate.fill(typed);
      const next = await save(adminPage, saveButton);
      expect(next.body.vatRate).toBe(sent);
      await expect(adminPage.getByText('Site settings saved.')).toBeVisible();
      expect((await readSiteSettings(admin)).vatRate).toBe(sent);
    }
    expect(routed.filter((method) => method === 'PATCH')).toHaveLength(3);
  });
});
