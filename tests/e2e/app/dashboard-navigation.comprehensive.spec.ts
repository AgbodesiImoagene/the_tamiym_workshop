import { expect } from '@playwright/test';
import { test } from '../fixtures/test';
import { assertVisibleControlsEnabled } from '../fixtures/interactions';
import { describeViewportMatrix } from '../fixtures/viewport-suite';

const NAV_LINKS = [
  { name: 'Home', path: '/dashboard' },
  { name: 'Products', path: '/dashboard/products' },
  { name: 'Cart', path: '/dashboard/cart' },
  { name: 'Design', path: '/dashboard/design' },
  { name: 'Orders', path: '/dashboard/orders' },
  { name: 'Fundraiser', path: '/dashboard/fundraiser' },
] as const;

describeViewportMatrix('Customer dashboard navigation @comprehensive @app', () => {
  test('primary nav links resolve for customer session', async ({ customerPage }) => {
    await customerPage.goto('/dashboard');
    await expect(
      customerPage.getByRole('heading', { name: /Welcome To Your Workshop/i })
    ).toBeVisible();

    for (const link of NAV_LINKS) {
      await customerPage.getByRole('link', { name: link.name }).click();
      await expect(customerPage).toHaveURL(new RegExp(`${link.path.replace('/', '\\/')}`));
    }
    await assertVisibleControlsEnabled(customerPage.locator('nav').first());
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
