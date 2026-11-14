import { expect, type Page } from '@playwright/test';

export const SITE_SETTINGS_API = '**/v1/admin/site-settings';

/** Opens the site settings page and waits until the saved settings have loaded. */
export async function openSiteSettings(page: Page, { vatRateSet = true } = {}) {
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
