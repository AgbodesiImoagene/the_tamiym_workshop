import { test, expect, type Page } from '@playwright/test';
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

async function fillAdminPasswordStep(page: Page, email: string, password: string): Promise<void> {
  // Prefer placeholders / input types: FormLabel "Password" sits beside a
  // helper span and is not reliably exposed as an accessible name in CI.
  await page.getByPlaceholder('admin@tamiym.com').fill(email);
  await page.locator('input[type="password"]').fill(password);
  await page.getByRole('button', { name: /^Continue$/i }).click();
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

    await fillAdminPasswordStep(page, e2eUsers.admin.email, e2eUsers.admin.password);

    await expect(page.getByText('Two-factor authentication')).toBeVisible({
      timeout: 15_000,
    });

    await page.getByPlaceholder('123456').fill('000000');
    await page.getByRole('button', { name: /Verify and sign in/i }).click();

    // Prefer the product error box class — Next also mounts an empty role=alert announcer.
    const alert = page.locator('[role="alert"].border-red-200');
    await expect(alert).toBeVisible({ timeout: 10_000 });
    await expect(alert).toContainText(/Unauthorized|rejected|try again/i);
    await expect(page).toHaveURL(/\/auth\/login/);

    await page.getByPlaceholder('123456').fill(generateTotpCode(e2eUsers.admin.totpSecret));
    await page.getByRole('button', { name: /Verify and sign in/i }).click();

    await expect(page).toHaveURL(/\/admin\/?$/, { timeout: 20_000 });
    await expect(page.getByText(/Operations overview/i).first()).toBeVisible();

    await context.close();
  });

  test('recovery field shows accessible empty-state validation', async ({ browser }) => {
    const context = await browser.newContext({ baseURL: urls.admin });
    const page = await context.newPage();

    await page.goto('/auth/login');
    await fillAdminPasswordStep(page, e2eUsers.admin.email, e2eUsers.admin.password);
    await expect(page.getByText('Two-factor authentication')).toBeVisible({
      timeout: 15_000,
    });

    await page.getByRole('button', { name: /Use a recovery code instead/i }).click();
    await page.getByRole('button', { name: /Use recovery code/i }).click();
    await expect(page.getByText('Enter a recovery code')).toBeVisible();

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
    await fillAdminPasswordStep(page, e2eUsers.admin.email, e2eUsers.admin.password);
    await expect(page.getByText('Two-factor authentication')).toBeVisible({
      timeout: 15_000,
    });

    await page.getByRole('button', { name: /Use a recovery code instead/i }).click();
    const recoveryField = page.getByPlaceholder('XXXX-XXXX-...');
    await expect(recoveryField).toBeVisible();
    await recoveryField.click();
    await recoveryField.fill(recoveryCode);
    await expect(recoveryField).toHaveValue(recoveryCode);
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
    await fillAdminPasswordStep(page, e2eUsers.adminEnroll.email, e2eUsers.adminEnroll.password);

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

    await page.getByPlaceholder('123456').fill(generateTotpCode(secretText!.trim()));
    await page.getByRole('button', { name: /Enable MFA and sign in/i }).click();

    await expect(page).toHaveURL(/\/admin\/?$/, { timeout: 20_000 });
    await expect(page.getByText(/Operations overview/i).first()).toBeVisible();

    await context.close();
  });
});
