import { test, expect } from '@playwright/test';
import { apiLogin, createApiContext } from '../fixtures/api';
import { e2eUsers, E2E_ADMIN_ENROLL_USER_ID, urls } from '../fixtures/identities';
import { generateTotpCode } from '../fixtures/totp';

/**
 * Clear MFA on the enroll fixture so UI enrollment stays idempotent under
 * CI retries and local re-runs without a full reseed.
 */
async function resetEnrollAdminMfa(): Promise<void> {
  const api = await createApiContext('ADMIN');
  const { csrfToken } = await apiLogin(
    api,
    e2eUsers.admin.email,
    e2eUsers.admin.password,
    'ADMIN',
    e2eUsers.admin.totpSecret
  );
  const reset = await api.post(`admin/users/${E2E_ADMIN_ENROLL_USER_ID}/mfa/reset`, {
    headers: { 'X-CSRF-Token': csrfToken },
  });
  expect(reset.ok(), await reset.text()).toBeTruthy();
  await api.dispose();
}

/**
 * TTW-023 — Admin console MFA enrollment, challenge, recovery, and accessible errors
 * through the real login UI (not the API-only setup helper).
 *
 * Uses a fresh browser context (no storageState) so chromium-admin's saved
 * session does not skip the login form.
 */
test.describe('Admin MFA console login @smoke @admin', () => {
  test.describe.configure({ mode: 'serial' });

  test('wrong TOTP errors then valid TOTP reaches overview', async ({ browser }) => {
    const context = await browser.newContext({ baseURL: urls.admin });
    const page = await context.newPage();

    await page.goto('/auth/login');
    await expect(page.getByText('Admin sign in')).toBeVisible();

    await page.getByLabel(/Email address/i).fill(e2eUsers.admin.email);
    await page.getByLabel(/^Password$/i).fill(e2eUsers.admin.password);
    await page.getByRole('button', { name: /^Continue$/i }).click();

    await expect(page.getByText('Two-factor authentication')).toBeVisible({
      timeout: 15_000,
    });

    await page.getByLabel(/Authenticator code/i).fill('000000');
    await page.getByRole('button', { name: /Verify and sign in/i }).click();

    const alert = page.getByRole('alert');
    await expect(alert).toBeVisible({ timeout: 10_000 });
    await expect(alert).toContainText(/Unauthorized|rejected|try again/i);
    await expect(page).toHaveURL(/\/auth\/login/);

    await page.getByLabel(/Authenticator code/i).fill(generateTotpCode(e2eUsers.admin.totpSecret));
    await page.getByRole('button', { name: /Verify and sign in/i }).click();

    await expect(page).toHaveURL(/\/admin\/?$/, { timeout: 20_000 });
    await expect(page.getByText(/Operations overview/i).first()).toBeVisible();

    await context.close();
  });

  test('recovery code completes admin console login', async ({ browser }, testInfo) => {
    const recoveryCode =
      e2eUsers.admin.recoveryCodes[
        Math.min(testInfo.retry, e2eUsers.admin.recoveryCodes.length - 1)
      ]!;

    const context = await browser.newContext({ baseURL: urls.admin });
    const page = await context.newPage();

    await page.goto('/auth/login');
    await page.getByLabel(/Email address/i).fill(e2eUsers.admin.email);
    await page.getByLabel(/^Password$/i).fill(e2eUsers.admin.password);
    await page.getByRole('button', { name: /^Continue$/i }).click();
    await expect(page.getByText('Two-factor authentication')).toBeVisible({
      timeout: 15_000,
    });

    await page.getByRole('button', { name: /Use a recovery code instead/i }).click();
    await page.getByLabel(/Recovery code/i).fill('0000-0000-0000-0000-0000-0000-0000-0000');
    await page.getByRole('button', { name: /Use recovery code/i }).click();

    const alert = page.getByRole('alert');
    await expect(alert).toBeVisible({ timeout: 10_000 });
    await expect(alert).toContainText(/Unauthorized|rejected|try again/i);
    await expect(page.getByLabel(/Recovery code/i)).toBeVisible();

    await page.getByLabel(/Recovery code/i).fill(recoveryCode);
    await page.getByRole('button', { name: /Use recovery code/i }).click();

    await expect(page).toHaveURL(/\/admin\/?$/, { timeout: 20_000 });
    await expect(page.getByText(/Operations overview/i).first()).toBeVisible();

    await context.close();
  });

  test('unenrolled admin completes MFA enrollment in the console', async ({ browser }) => {
    await resetEnrollAdminMfa();

    const context = await browser.newContext({ baseURL: urls.admin });
    const page = await context.newPage();

    await page.goto('/auth/login');
    await page.getByLabel(/Email address/i).fill(e2eUsers.adminEnroll.email);
    await page.getByLabel(/^Password$/i).fill(e2eUsers.adminEnroll.password);
    await page.getByRole('button', { name: /^Continue$/i }).click();

    await expect(page.getByText('Set up authenticator')).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.getByText(/Recovery codes \(save now\)/i)).toBeVisible();

    const secretText = await page
      .locator('span.font-mono')
      .filter({ hasText: /^[A-Z2-7]+=*$/i })
      .first()
      .textContent();
    expect(secretText, 'enrollment secret visible').toBeTruthy();

    await page.getByLabel(/Authenticator code/i).fill(generateTotpCode(secretText!.trim()));
    await page.getByRole('button', { name: /Enable MFA and sign in/i }).click();

    await expect(page).toHaveURL(/\/admin\/?$/, { timeout: 20_000 });
    await expect(page.getByText(/Operations overview/i).first()).toBeVisible();

    await context.close();
  });
});
