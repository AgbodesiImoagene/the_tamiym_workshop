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
    // TTW-192: the state and the LGA are chosen from lists, not typed.
    await expect(customerPage.getByLabel('State')).not.toHaveJSProperty('tagName', 'INPUT');
    await expect(customerPage.getByLabel('LGA')).not.toHaveJSProperty('tagName', 'INPUT');

    const saveButtons = customerPage.getByRole('button', { name: 'Save' });
    expect(await saveButtons.count()).toBeGreaterThanOrEqual(1);
    await assertVisibleControlsEnabled(customerPage.locator('main'));
  });

  test('shipping address is saved with a state code and an LGA chosen from the lists', async ({
    customerPage,
  }) => {
    // The customer's address is shared with checkout-idempotency.spec.ts and both
    // viewports save the same address, so the test reads the save response instead of
    // reloading the page.
    const addressesLoaded = customerPage.waitForResponse(
      (response) =>
        response.request().method() === 'GET' && /\/v1\/users\/addresses$/.test(response.url())
    );
    await customerPage.goto('/dashboard/settings');
    const saved = (await (await addressesLoaded).json()) as Array<{ addressLine1: string }>;
    // The form fills itself once the saved address is rendered; typing before that
    // would be overwritten.
    if (saved.length > 0) {
      await expect(customerPage.getByLabel('Street Address')).toHaveValue(saved[0].addressLine1);
    }

    const state = customerPage.getByLabel('State');
    const lga = customerPage.getByLabel('LGA');
    await expect(state).toBeEnabled();
    await customerPage.getByLabel('City').fill('Ikeja');
    await customerPage.getByLabel('Street Address').fill('1 Settings Street');
    // CI seeds only Lagos (with the LGA Ikeja) and Abuja (no LGA): seed:e2e.
    await state.selectOption({ label: 'Lagos' });
    await expect(lga).toBeEnabled();
    await expect(lga.locator('option', { hasText: 'Ikeja' })).toHaveCount(1);
    await lga.selectOption({ label: 'Ikeja' });
    // Choosing another state clears the LGA, and Lagos's LGAs are no longer offered.
    await state.selectOption({ label: 'Abuja Federal Capital Territory' });
    await expect(lga).toHaveValue('');
    await expect(lga.locator('option', { hasText: 'Ikeja' })).toHaveCount(0);
    await state.selectOption({ label: 'Lagos' });
    await expect(lga).toHaveValue('');
    await expect(lga.locator('option', { hasText: 'Ikeja' })).toHaveCount(1);
    await lga.selectOption({ label: 'Ikeja' });

    const addressForm = customerPage.getByLabel('Street Address').locator('xpath=ancestor::form');
    const savedResponse = customerPage.waitForResponse(
      (response) =>
        ['PATCH', 'POST'].includes(response.request().method()) &&
        /\/v1\/users\/addresses(\/[^/]+)?$/.test(response.url())
    );
    await addressForm.getByRole('button', { name: 'Save' }).click();
    const response = await savedResponse;

    expect(response.status()).toBeLessThan(300);
    const sent = response.request().postDataJSON() as Record<string, unknown>;
    expect(sent).toMatchObject({ state: 'Lagos', stateCode: 'LA' });
    expect(sent.lgaId).toEqual(expect.any(String));
    const body = (await response.json()) as { state: string; stateCode: string; lgaId: string };
    expect(body).toMatchObject({ state: 'Lagos', stateCode: 'LA', lgaId: sent.lgaId });
  });

  test('profile page reuses settings form controls', async ({ customerPage }) => {
    await customerPage.goto('/dashboard/profile');
    await expect(customerPage.getByRole('heading', { name: /Profile/i })).toBeVisible();
    await expect(customerPage.getByLabel('First Name')).toBeVisible();
    await assertVisibleControlsEnabled(customerPage.locator('main'));
  });
});
