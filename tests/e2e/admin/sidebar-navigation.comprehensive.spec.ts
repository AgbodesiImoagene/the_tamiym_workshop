import { expect } from '@playwright/test';
import { test } from '../fixtures/test';
import { assertVisibleControlsEnabled } from '../fixtures/interactions';
import { describeViewportMatrix } from '../fixtures/viewport-suite';

const SIDEBAR_ROUTES = [
  { label: 'Overview', heading: /Operations overview/i },
  { label: 'Orders', heading: /Orders workspace/i },
  { label: 'Campaigns', heading: /Campaigns workspace/i },
  { label: 'Payouts', heading: /Payout runs/i },
  { label: 'Catalog', heading: /Products/i },
  { label: 'Pricing', heading: /Discounts/i },
  { label: 'Shipping', heading: /Shipping zones/i },
  { label: 'Moderation', heading: /Campaign moderation/i },
  { label: 'Notifications', heading: /Notifications/i },
  { label: 'Admins', heading: /Admins & roles/i },
  { label: 'Settings', heading: /Site settings/i },
] as const;

describeViewportMatrix('Admin sidebar navigation @comprehensive @admin', () => {
  test('sidebar links reach each primary workspace', async ({ adminPage }) => {
    await adminPage.goto('/admin');
    await expect(adminPage.getByRole('heading', { name: /Operations overview/i })).toBeVisible();

    for (const route of SIDEBAR_ROUTES) {
      await adminPage.getByRole('link', { name: route.label, exact: true }).click();
      await expect(adminPage.getByRole('heading', { name: route.heading }).first()).toBeVisible();
    }

    await assertVisibleControlsEnabled(adminPage.locator('nav').first());
  });

  test('overview date filters and CSV exports are interactive', async ({ adminPage }) => {
    await adminPage.goto('/admin');
    await expect(adminPage.locator('#ov-from')).toBeVisible();
    await expect(adminPage.locator('#ov-to')).toBeVisible();
    await expect(adminPage.getByRole('button', { name: /Apply to overview/i })).toBeVisible();
    await expect(adminPage.getByRole('button', { name: /Download orders CSV/i })).toBeVisible();
    await expect(adminPage.getByRole('button', { name: /Download campaigns CSV/i })).toBeVisible();
    await assertVisibleControlsEnabled(adminPage.locator('main'));
  });
});
