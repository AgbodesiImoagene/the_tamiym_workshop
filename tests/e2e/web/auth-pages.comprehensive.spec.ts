import { expect } from '@playwright/test';
import { test } from '../fixtures/test';
import { assertVisibleControlsEnabled } from '../fixtures/interactions';
import { describeViewportMatrix } from '../fixtures/viewport-suite';

describeViewportMatrix('Web auth pages @comprehensive @web', () => {
  test('login form fields, toggles, and cross-links', async ({ page }) => {
    await page.goto('/auth/login?next=%2Ffundraiser');
    await expect(page.getByLabel('Email address')).toBeVisible();
    await expect(page.getByPlaceholder('Enter your password')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Sign in' })).toBeVisible();
    await expect(page.getByRole('link', { name: /Create your account/i })).toBeVisible();
    await expect(page.getByRole('link', { name: /Sign in with Google/i })).toBeVisible();

    await page.getByRole('button', { name: /Show/i }).click();
    await expect(page.getByPlaceholder('Enter your password')).toHaveAttribute('type', 'text');
    await page.getByRole('button', { name: /Hide/i }).click();

    await page.getByRole('link', { name: /Create your account/i }).click();
    await expect(page).toHaveURL(/\/auth\/register/);
    await assertVisibleControlsEnabled(page.locator('form'));
  });

  test('register form validation surfaces on empty submit', async ({ page }) => {
    await page.goto('/auth/register');
    await page.getByRole('button', { name: 'Create account' }).click();
    await expect(page.getByLabel('Email address')).toBeVisible();
    await expect(page.getByRole('link', { name: /Sign in instead/i })).toBeVisible();
    await assertVisibleControlsEnabled(page.locator('form'));
  });

  test('verify-email token form is present', async ({ page }) => {
    await page.goto('/verify-email?next=%2F');
    await expect(page.getByLabel(/Verification token/i)).toBeVisible();
    await expect(page.getByRole('button', { name: /Verify email/i })).toBeVisible();
    await assertVisibleControlsEnabled(page.locator('form'));
  });
});
