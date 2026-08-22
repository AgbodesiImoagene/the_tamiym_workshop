import { expect } from '@playwright/test';
import { test } from '../fixtures/test';
import {
  assertVisibleControlsEnabled,
  navigateCustomerSidebarLink,
} from '../fixtures/interactions';
import { describeViewportMatrix } from '../fixtures/viewport-suite';

const CUSTOMER_NAV_LINKS = [
  { name: 'Home', path: '/dashboard' },
  { name: 'Products', path: '/dashboard/products' },
  { name: 'Cart', path: '/dashboard/cart' },
  { name: 'Design', path: '/dashboard/design' },
  { name: 'Orders', path: '/dashboard/orders' },
] as const;

const ORGANISER_NAV_LINKS = [
  ...CUSTOMER_NAV_LINKS,
  { name: 'Fundraiser', path: '/dashboard/fundraiser' },
] as const;

describeViewportMatrix('Customer dashboard navigation @comprehensive @app', () => {
  test('primary nav links resolve for customer session', async ({ customerPage }) => {
    await customerPage.goto('/dashboard');
    await expect(
      customerPage.getByRole('heading', { name: /Welcome To Your Workshop/i })
    ).toBeVisible();

    for (const link of CUSTOMER_NAV_LINKS) {
      await navigateCustomerSidebarLink(customerPage, link.name, link.path);
    }
    await assertVisibleControlsEnabled(customerPage.locator('aside nav, main').first());
  });

  test('fundraiser hub resolves for organiser session', async ({ organiserPage }) => {
    await organiserPage.goto('/dashboard');
    for (const link of ORGANISER_NAV_LINKS) {
      await navigateCustomerSidebarLink(organiserPage, link.name, link.path);
    }
  });

  test('dashboard quick links open profile and settings', async ({ customerPage }) => {
    await customerPage.goto('/dashboard');
    await customerPage.getByRole('link', { name: 'edit' }).click();
    await expect(customerPage).toHaveURL(/\/dashboard\/profile/);
    await customerPage.goto('/dashboard');
    await customerPage.getByRole('link', { name: 'manage' }).click();
    await expect(customerPage).toHaveURL(/\/dashboard\/settings/);
  });
});
