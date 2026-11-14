import { expect, type Page } from '@playwright/test';
import { test } from '../fixtures/test';
import { assertVisibleControlsEnabled } from '../fixtures/interactions';
import { describeViewportMatrix } from '../fixtures/viewport-suite';

const SITE_SETTINGS_API = '**/v1/admin/site-settings';
const VAT_RATE_ERROR =
  'Enter a VAT rate between 0 and 100, with at most 2 decimals, before saving.';
const VAT_NOT_CONFIGURED = 'No VAT rate is set. Checkout is paused until you enter one and save.';

/** Opens the site settings page and waits until the saved settings have loaded. */
async function openSiteSettings(page: Page, { vatRateSet = true } = {}) {
  await page.goto('/admin/settings/site');
  const saveButton = page.getByRole('button', { name: /Save site settings/i });
  const vatRate = page.getByLabel('VAT rate (%)');
  // The Save button only renders once settings have loaded.
  await expect(saveButton).toBeVisible();
  // The form takes the loaded values in an effect after that render: wait for
  // them before reading any field, or a test would capture the defaults.
  if (vatRateSet) await expect(vatRate).not.toHaveValue('');
  return {
    saveButton,
    resetButton: page.getByRole('button', { name: /Reset unsaved changes/i }),
    vatRate,
  };
}

/** Collects every site settings write the page sends (none may leave on a refused save). */
function recordSettingsWrites(page: Page): string[] {
  const writes: string[] = [];
  page.on('request', (request) => {
    if (request.method() !== 'GET' && request.url().endsWith('/v1/admin/site-settings')) {
      writes.push(`${request.method()} ${request.url()}`);
    }
  });
  return writes;
}

/**
 * Answers the settings PATCH without touching the shared database (the three
 * viewports run in parallel against the same seed) and records each body.
 *
 * Kept as a first-party stub (TTW-209 audit): site settings are one global row
 * (VAT rate, payout mode) that checkout and payout specs read in parallel, so a
 * real save of 0 % or 100 % VAT from this test would change their totals. The
 * real GET still serves the page, and the refused-save tests above send nothing.
 * The real PATCH is covered by the API tests (admin-site-settings.controller.spec.ts).
 */
async function mockSettingsSave(page: Page): Promise<Record<string, unknown>[]> {
  const bodies: Record<string, unknown>[] = [];
  await page.route(SITE_SETTINGS_API, async (route) => {
    if (route.request().method() !== 'PATCH') return route.fallback();
    const body = route.request().postDataJSON() as Record<string, unknown>;
    bodies.push(body);
    // The page sends every field, so the body is the full updated settings.
    await route.fulfill({ json: { id: 'default', ...body } });
  });
  return bodies;
}

describeViewportMatrix('Admin catalog and settings @comprehensive @admin', () => {
  test('catalog products list and new product entry', async ({ adminPage }) => {
    await adminPage.goto('/admin/catalog/products');
    await expect(adminPage.getByRole('heading', { name: /^Products$/i })).toBeVisible();
    await expect(adminPage.getByRole('link', { name: /New product/i })).toBeVisible();

    await adminPage.getByRole('link', { name: /New product/i }).click();
    await expect(adminPage.getByRole('heading', { name: /New product/i })).toBeVisible();
    await expect(adminPage.locator('#np-name')).toBeVisible();
    await expect(adminPage.getByRole('button', { name: /Create product/i })).toBeVisible();
    await assertVisibleControlsEnabled(adminPage.locator('main'));
  });

  test('categories workspace form controls', async ({ adminPage }) => {
    await adminPage.goto('/admin/catalog/categories');
    await expect(adminPage.getByRole('heading', { name: /Categories/i })).toBeVisible();
    await expect(adminPage.locator('#name')).toBeVisible();
    await expect(adminPage.getByRole('button', { name: /Create category/i })).toBeVisible();
    await assertVisibleControlsEnabled(adminPage.locator('main'));
  });

  test('site settings payout and pricing panels', async ({ adminPage }) => {
    await adminPage.goto('/admin/settings/site');
    await expect(adminPage.getByRole('heading', { name: /Site settings/i })).toBeVisible();
    await expect(adminPage.locator('#vatRatePercent')).toBeVisible();
    await expect(adminPage.locator('#payoutMode')).toBeVisible();
    await expect(adminPage.getByRole('button', { name: /Save site settings/i })).toBeVisible();
    await expect(adminPage.getByRole('button', { name: /Reset unsaved changes/i })).toBeVisible();
    await assertVisibleControlsEnabled(adminPage.locator('main'));
  });

  test('site settings refuse to save an empty VAT rate (TTW-084)', async ({ adminPage }) => {
    await adminPage.goto('/admin/settings/site');
    const saveButton = adminPage.getByRole('button', { name: /Save site settings/i });
    // The Save button only renders once settings have loaded, so the field
    // now holds the saved rate rather than a loading placeholder.
    await expect(saveButton).toBeVisible();
    const vatRate = adminPage.getByLabel('VAT rate (%)');
    await expect(vatRate).not.toHaveValue('');
    const savedVatRate = await vatRate.inputValue();

    await vatRate.fill('');
    await saveButton.click();

    await expect(
      adminPage.getByRole('alert').filter({ hasText: /Enter a VAT rate/ })
    ).toBeVisible();
    await expect(vatRate).toHaveAttribute('aria-invalid', 'true');
    await adminPage.reload();
    await expect(adminPage.getByRole('button', { name: /Save site settings/i })).toBeVisible();
    await expect(adminPage.getByLabel('VAT rate (%)')).toHaveValue(savedVatRate);
  });

  test('site settings refuse an out-of-range or over-precise VAT rate (TTW-183)', async ({
    adminPage,
  }) => {
    const writes = recordSettingsWrites(adminPage);
    const { saveButton, vatRate } = await openSiteSettings(adminPage);
    await expect(vatRate).not.toHaveAttribute('aria-invalid');
    await expect(vatRate).not.toHaveAttribute('aria-describedby');

    for (const refused of ['100.01', '101', '7.555']) {
      await vatRate.fill(refused);
      await saveButton.click();

      await expect(adminPage.locator('#siteSettingsError')).toHaveText(VAT_RATE_ERROR);
      await expect(adminPage.locator('#siteSettingsError')).toHaveAttribute('role', 'alert');
      await expect(vatRate).toHaveAttribute('aria-invalid', 'true');
      await expect(vatRate).toHaveAttribute('aria-describedby', 'siteSettingsError');
    }
    expect(writes).toEqual([]);
  });

  test('site settings warn when no VAT rate is set and keep requiring one (TTW-183)', async ({
    adminPage,
  }) => {
    const writes = recordSettingsWrites(adminPage);
    // Kept (TTW-209 audit): the seed always sets a VAT rate, and no admin route
    // clears it, so the unset state is forced on the real GET response.
    await adminPage.route(SITE_SETTINGS_API, async (route) => {
      if (route.request().method() !== 'GET') return route.fallback();
      const response = await route.fetch();
      await route.fulfill({ response, json: { ...(await response.json()), vatRate: null } });
    });
    const { saveButton, vatRate } = await openSiteSettings(adminPage, { vatRateSet: false });
    await expect(adminPage.locator('#vatRateNotConfigured')).toBeVisible();

    // An unset rate stays empty: it is never shown, or saved back, as 0 %.
    await expect(vatRate).toHaveValue('');
    const notConfigured = adminPage.locator('#vatRateNotConfigured');
    await expect(notConfigured).toHaveText(VAT_NOT_CONFIGURED);
    await expect(notConfigured).toHaveAttribute('role', 'alert');
    await expect(vatRate).toHaveAttribute('aria-describedby', 'vatRateNotConfigured');
    await expect(vatRate).not.toHaveAttribute('aria-invalid');

    // Changing only a payout field still needs a VAT rate first (TTW-084).
    const cadence = adminPage.getByLabel('Payout cadence (days)');
    const savedCadence = await cadence.inputValue();
    await cadence.fill(savedCadence === '14' ? '15' : '14');
    await expect(saveButton).toBeEnabled();
    await saveButton.click();

    await expect(adminPage.locator('#siteSettingsError')).toHaveText(VAT_RATE_ERROR);
    await expect(vatRate).toHaveAttribute('aria-invalid', 'true');
    await expect(vatRate).toHaveAttribute(
      'aria-describedby',
      'vatRateNotConfigured siteSettingsError'
    );
    expect(writes).toEqual([]);
  });

  test('site settings save the VAT rate as a fraction with the other fields (TTW-183)', async ({
    adminPage,
  }) => {
    const bodies = await mockSettingsSave(adminPage);
    const { saveButton, resetButton, vatRate } = await openSiteSettings(adminPage);
    await expect(saveButton).toBeDisabled();
    await expect(resetButton).toBeDisabled();

    // Every field reaches the request: a checkbox, a select, and a blank minimum.
    const pricesIncludeVat = adminPage.getByRole('checkbox', { name: /Prices include VAT/i });
    const pricesIncludedBefore = await pricesIncludeVat.isChecked();
    await pricesIncludeVat.click();
    const payoutMode = adminPage.locator('#payoutMode');
    const nextMode = (await payoutMode.innerText()).includes('MANUAL') ? 'AUTO_EXECUTE' : 'MANUAL';
    await payoutMode.click();
    await adminPage.getByRole('option', { name: nextMode.replaceAll('_', ' ') }).click();
    await adminPage.getByLabel('Minimum payout amount').fill('');
    await adminPage.getByLabel('Payout cadence (days)').fill('14');
    await vatRate.fill('7.55');
    await saveButton.click();

    await expect(adminPage.getByText('Site settings saved.')).toBeVisible();
    expect(bodies).toHaveLength(1);
    expect(bodies[0]).toEqual({
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

    // Boundaries: 100 % and an explicitly typed 0 % are both accepted.
    for (const [typed, sent] of [
      ['100', 1],
      ['0', 0],
    ] as const) {
      await expect(saveButton).toBeDisabled();
      await vatRate.fill(typed);
      await saveButton.click();
      await expect.poll(() => bodies.at(-1)?.vatRate).toBe(sent);
      await expect(adminPage.getByText('Site settings saved.')).toBeVisible();
    }
    expect(bodies).toHaveLength(3);
  });

  // Uses the unguarded `page` (same admin session and viewport): the mocked 400
  // makes the browser log a console error, which the adminPage guard rejects.
  // Kept (TTW-209 audit): a deliberate frontend error-state test. The real API
  // refuses only what the page already blocks, so it cannot produce this 400.
  test('site settings show an API save error in the alert (TTW-183)', async ({ page }) => {
    await page.route(SITE_SETTINGS_API, async (route) => {
      if (route.request().method() !== 'PATCH') return route.fallback();
      await route.fulfill({
        status: 400,
        json: { statusCode: 400, message: 'Site settings rejected by the test server.' },
      });
    });
    const { saveButton, vatRate } = await openSiteSettings(page);

    await vatRate.fill('8.25');
    await saveButton.click();

    const alert = page.locator('#siteSettingsError');
    await expect(alert).toHaveText('Site settings rejected by the test server.');
    await expect(alert).toHaveAttribute('role', 'alert');
    await expect(page.getByText('Site settings saved.')).toHaveCount(0);
    // A server refusal is not a VAT format problem.
    await expect(vatRate).not.toHaveAttribute('aria-invalid');
    await expect(saveButton).toBeEnabled();
  });

  test('site settings reset restores the saved values and clears messages (TTW-183)', async ({
    adminPage,
  }) => {
    const writes = recordSettingsWrites(adminPage);
    const { saveButton, resetButton, vatRate } = await openSiteSettings(adminPage);
    const savedVatRate = await vatRate.inputValue();
    const cadence = adminPage.getByLabel('Payout cadence (days)');
    const savedCadence = await cadence.inputValue();

    await vatRate.fill('');
    await cadence.fill(savedCadence === '30' ? '31' : '30');
    await saveButton.click();
    await expect(adminPage.locator('#siteSettingsError')).toHaveText(VAT_RATE_ERROR);
    await expect(resetButton).toBeEnabled();

    await resetButton.click();

    await expect(vatRate).toHaveValue(savedVatRate);
    await expect(cadence).toHaveValue(savedCadence);
    await expect(adminPage.locator('#siteSettingsError')).toHaveCount(0);
    await expect(saveButton).toBeDisabled();
    await expect(resetButton).toBeDisabled();
    expect(writes).toEqual([]);
  });

  // TTW-183 design decision: the VAT error state follows the value. Before the
  // move to React Hook Form, Reset left aria-invalid on the field while the
  // error text it pointed to was gone, and a corrected value kept the message.
  test('site settings drop the VAT error once the value is valid or reset (TTW-183)', async ({
    adminPage,
  }) => {
    const { saveButton, resetButton, vatRate } = await openSiteSettings(adminPage);
    const savedVatRate = await vatRate.inputValue();

    await vatRate.fill('101');
    await saveButton.click();
    await expect(adminPage.locator('#siteSettingsError')).toHaveText(VAT_RATE_ERROR);

    // Still invalid while typing: the message stays.
    await vatRate.fill('7.555');
    await expect(adminPage.locator('#siteSettingsError')).toHaveText(VAT_RATE_ERROR);
    await expect(vatRate).toHaveAttribute('aria-invalid', 'true');

    // Valid again: message and invalid mark go together, nothing is sent.
    await vatRate.fill('7.55');
    await expect(adminPage.locator('#siteSettingsError')).toHaveCount(0);
    await expect(vatRate).not.toHaveAttribute('aria-invalid');
    await expect(vatRate).not.toHaveAttribute('aria-describedby');

    await vatRate.fill('');
    await saveButton.click();
    await expect(vatRate).toHaveAttribute('aria-invalid', 'true');
    await resetButton.click();

    await expect(vatRate).toHaveValue(savedVatRate);
    await expect(adminPage.locator('#siteSettingsError')).toHaveCount(0);
    await expect(vatRate).not.toHaveAttribute('aria-invalid');
    await expect(vatRate).not.toHaveAttribute('aria-describedby');
  });

  test('payout runs workspace create panel', async ({ adminPage }) => {
    await adminPage.goto('/admin/payouts/runs');
    await expect(adminPage.getByRole('heading', { name: /Payout runs/i })).toBeVisible();
    await expect(adminPage.locator('#status')).toBeVisible();

    const cutoff = adminPage.locator('#cutoffAt');
    if (await cutoff.isVisible()) {
      await expect(cutoff).toBeVisible();
      await expect(adminPage.getByRole('button', { name: /Create payout run/i })).toBeVisible();
    }

    await assertVisibleControlsEnabled(adminPage.locator('main'));
  });
});
