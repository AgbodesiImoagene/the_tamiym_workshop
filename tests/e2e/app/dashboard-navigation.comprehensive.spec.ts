import { expect } from '@playwright/test';
import { test } from '../fixtures/test';
import {
  assertVisibleControlsEnabled,
  navigateCustomerSidebarLink,
  pathUrlMatcher,
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

// TTW-260: the sidebar belongs to the dashboard layout, so clicking through the menu keeps it
// (no remount) and the signed-in user is requested once. The sidebar only exists from the
// `lg` breakpoint up, so this runs on a desktop viewport.
test.describe('Customer dashboard sidebar persistence @comprehensive @app', () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test('the sidebar is kept between pages and /auth/me is requested once', async ({
    customerPage,
  }) => {
    const meRequests: string[] = [];
    customerPage.on('request', (request) => {
      if (/\/v1\/auth\/me(?:\?|$)/.test(request.url())) meRequests.push(request.url());
    });

    await customerPage.goto('/dashboard');
    await expect(customerPage.locator('aside nav')).toBeVisible();
    await customerPage.locator('aside').evaluate((aside) => {
      aside.setAttribute('data-e2e-mark', 'kept');
    });

    for (const link of ['Products', 'Cart', 'Orders', 'Home'] as const) {
      const path = link === 'Home' ? '/dashboard' : `/dashboard/${link.toLowerCase()}`;
      await customerPage
        .locator('aside nav')
        .getByRole('link', { name: link, exact: true })
        .click();
      await expect(customerPage).toHaveURL(pathUrlMatcher(path));
      await expect(customerPage.locator('aside')).toHaveAttribute('data-e2e-mark', 'kept');
    }

    expect(meRequests).toHaveLength(1);
  });
});
