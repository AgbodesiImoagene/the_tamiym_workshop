import { expect } from '@playwright/test';
import { test } from '../fixtures/test';
import { assertVisibleControlsEnabled } from '../fixtures/interactions';
import {
  E2E_EXPIRED_PASSWORD_RESET_TOKEN,
  E2E_PASSWORD_RESET_TOKENS,
  e2eUsers,
} from '../fixtures/identities';

// TTW-089: a customer who forgot their password recovers the account from the
// login page. The full journey runs in chromium-web only: the seeded reset token is
// single-use and the user's password changes, so one seed serves one browser. The API keeps only the
// sha256 of a token, so seed:e2e writes known tokens instead of an email inbox.
const NEW_PASSWORD = 'ResetPassword1!';
const GENERIC_MESSAGE = /if an account exists with this email/i;

test.use({ storageState: { cookies: [], origins: [] } });

test.describe('Web password reset @comprehensive @web', () => {
  test('login links to the forgot-password page', async ({ page }) => {
    await page.goto('/auth/login');
    await page.getByRole('link', { name: /Forgot password\?/i }).click();
    await expect(page).toHaveURL(/\/auth\/forgot-password/);
    await expect(page.getByText('Reset your password', { exact: true })).toBeVisible();
    await assertVisibleControlsEnabled(page.locator('form'));
  });

  test('forgot-password validates the email and gives the same answer for any account', async ({
    page,
  }, testInfo) => {
    await page.goto('/auth/forgot-password');
    await page.getByRole('button', { name: 'Send reset link' }).click();
    await expect(page.getByText('Enter a valid email address')).toBeVisible();

    // An address with no account and a seeded one must look identical. The rate limit
    // counts requests per email across every browser project of the matrix, so the
    // unknown address is unique to the project and the seeded one is used in one only.
    const emails = [`nobody.${testInfo.project.name}@tamiym.test`];
    if (testInfo.project.name === 'chromium-web') emails.push(e2eUsers.customer.email);
    for (const email of emails) {
      await page.goto('/auth/forgot-password');
      await page.getByLabel('Email address').fill(email);
      await page.getByRole('button', { name: 'Send reset link' }).click();
      await expect(page.getByText(GENERIC_MESSAGE)).toBeVisible();
      await expect(page.getByRole('link', { name: /Back to sign in/i })).toBeVisible();
      await expect(page.getByText(/no account|not found/i)).toHaveCount(0);
    }
  });

  test('reset-password rejects a missing token without a form', async ({ page }) => {
    await page.goto('/reset-password');
    await expect(page.getByText(/link is invalid or has expired/i)).toBeVisible();
    await expect(page.getByRole('link', { name: /Request a new link/i })).toHaveAttribute(
      'href',
      /\/auth\/forgot-password/
    );
    await expect(page.getByLabel('New password')).toHaveCount(0);
  });

  test('reset-password validates the new password and its confirmation', async ({ page }) => {
    await page.goto('/reset-password?token=any-token');
    await page.getByLabel('New password', { exact: true }).fill('short');
    await page.getByLabel('Confirm new password').fill('different');
    await page.getByRole('button', { name: 'Reset password' }).click();
    await expect(page.getByText('Password must be at least 8 characters')).toBeVisible();
    await expect(page.getByText('Passwords do not match')).toBeVisible();
    await assertVisibleControlsEnabled(page.locator('form'));
  });

  test('an expired link shows the expired state and a way to ask again', async ({
    page,
  }, testInfo) => {
    // The reset endpoint allows 5 attempts a minute per token, shared by all projects.
    test.skip(testInfo.project.name !== 'chromium-web', 'One browser project spends the token.');
    await page.goto(`/reset-password?token=${E2E_EXPIRED_PASSWORD_RESET_TOKEN}`);
    await page.getByLabel('New password', { exact: true }).fill(NEW_PASSWORD);
    await page.getByLabel('Confirm new password').fill(NEW_PASSWORD);
    await page.getByRole('button', { name: 'Reset password' }).click();
    await expect(page.getByText(/link is invalid or has expired/i)).toBeVisible();
    await page.getByRole('link', { name: /Request a new link/i }).click();
    await expect(page).toHaveURL(/\/auth\/forgot-password/);
  });

  test('request, open the link, set a password, sign in', async ({ page }, testInfo) => {
    test.skip(
      testInfo.project.name !== 'chromium-web',
      'The seeded reset token is single-use: only one browser project can spend it.'
    );
    const token =
      E2E_PASSWORD_RESET_TOKENS[Math.min(testInfo.retry, E2E_PASSWORD_RESET_TOKENS.length - 1)];

    // Request: the real forgot-password page and API. Any request for the reset user
    // would delete the seeded tokens (the API revokes earlier links), so ask for the
    // customer user here; the answer is the same for every address.
    await page.goto('/auth/forgot-password');
    await page.getByLabel('Email address').fill(e2eUsers.customer.email);
    await page.getByRole('button', { name: 'Send reset link' }).click();
    await expect(page.getByText(GENERIC_MESSAGE)).toBeVisible();

    // The emailed link carries the token; the page takes it out of the address bar.
    await page.goto(`/reset-password?token=${token}`);
    await expect(page.getByLabel('New password', { exact: true })).toBeVisible();
    await expect(page).not.toHaveURL(/token=/);

    await page.getByLabel('New password', { exact: true }).fill(NEW_PASSWORD);
    await page.getByLabel('Confirm new password').fill(NEW_PASSWORD);
    await page.getByRole('button', { name: 'Reset password' }).click();
    await expect(page.getByText(/password has been reset/i)).toBeVisible();

    // The same link cannot be used twice.
    await page.goto(`/reset-password?token=${token}`);
    await page.getByLabel('New password', { exact: true }).fill(NEW_PASSWORD);
    await page.getByLabel('Confirm new password').fill(NEW_PASSWORD);
    await page.getByRole('button', { name: 'Reset password' }).click();
    await expect(page.getByText(/link is invalid or has expired/i)).toBeVisible();

    // Sign in with the new password.
    await page.goto('/auth/login');
    await page.getByLabel('Email address').fill(e2eUsers.passwordReset.email);
    await page.getByPlaceholder('Enter your password').fill(NEW_PASSWORD);
    await page.getByRole('button', { name: 'Sign in' }).click();
    await expect(page).not.toHaveURL(/\/auth\/login/);
  });
});
