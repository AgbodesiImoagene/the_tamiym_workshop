import { expect } from '@playwright/test';
import { test } from '../fixtures/test';
import { assertVisibleControlsEnabled } from '../fixtures/interactions';
import { describeViewportMatrix } from '../fixtures/viewport-suite';

describeViewportMatrix('Customer settings forms @comprehensive @app', () => {
  test('settings page exposes personal, password, and shipping forms', async ({ customerPage }) => {
    await customerPage.goto('/dashboard/settings');
    await expect(customerPage.getByRole('heading', { name: /Settings/i })).toBeVisible();

    await expect(customerPage.getByLabel('First Name')).toBeVisible();
    await expect(customerPage.getByLabel('Surname')).toBeVisible();
    await expect(customerPage.getByLabel('Previous Password')).toBeVisible();
    await expect(customerPage.getByLabel('New Password')).toBeVisible();
    await expect(customerPage.getByLabel('Street Address')).toBeVisible();

    const saveButtons = customerPage.getByRole('button', { name: 'Save' });
    expect(await saveButtons.count()).toBeGreaterThanOrEqual(1);
    await assertVisibleControlsEnabled(customerPage.locator('main'));
  });

  test('profile page reuses settings form controls', async ({ customerPage }) => {
    await customerPage.goto('/dashboard/profile');
    await expect(customerPage.getByRole('heading', { name: /Profile/i })).toBeVisible();
    await expect(customerPage.getByLabel('First Name')).toBeVisible();
    await assertVisibleControlsEnabled(customerPage.locator('main'));
  });
});
