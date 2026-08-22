import { expect } from '@playwright/test';
import { test } from '../fixtures/test';
import { assertVisibleControlsEnabled, clickAdminSidebarLink } from '../fixtures/interactions';
import { describeViewportMatrix } from '../fixtures/viewport-suite';

const SIDEBAR_ROUTES = [
  { href: '/admin', heading: /Operations overview/i },
  { href: '/admin/orders', heading: /Orders workspace/i },
  { href: '/admin/campaigns', heading: /Campaigns workspace/i },
  { href: '/admin/payouts/runs', heading: /Payout runs/i },
  { href: '/admin/catalog/products', heading: /Products/i },
  { href: '/admin/pricing/discounts', heading: /Discounts/i },
  { href: '/admin/shipping/zones', heading: /Shipping zones/i },
  { href: '/admin/moderation/campaigns', heading: /Campaign moderation/i },
  { href: '/admin/notifications', heading: /Notifications/i },
  { href: '/admin/team', heading: /Admins & roles/i },
  { href: '/admin/settings/site', heading: /Site settings/i },
] as const;

describeViewportMatrix('Admin sidebar navigation @comprehensive @admin', () => {
  test('sidebar links reach each primary workspace', async ({ adminPage }) => {
    await adminPage.goto('/admin');
    await expect(adminPage.getByRole('heading', { name: /Operations overview/i })).toBeVisible();

    for (const route of SIDEBAR_ROUTES) {
      await clickAdminSidebarLink(adminPage, route.href);
      await expect(adminPage.getByRole('heading', { name: route.heading }).first()).toBeVisible();
    }

    await assertVisibleControlsEnabled(adminPage.locator('aside').first());
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
