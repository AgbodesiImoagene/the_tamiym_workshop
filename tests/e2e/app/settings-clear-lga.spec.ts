import { expect, test } from '@playwright/test';
import { originForSurface } from '../fixtures/api';
import { e2eUsers, urls } from '../fixtures/identities';

/**
 * TTW-193: a customer can remove the LGA saved on an address. The test registers
 * its own customer, so it never touches the address shared by the other specs.
 */
test.describe('Clear the saved LGA in settings @comprehensive @app', () => {
  test('choose an LGA, save, empty it, save: the saved address has no LGA', async ({ browser }) => {
    const context = await browser.newContext({ baseURL: urls.app });
    const register = await context.request.post(`${urls.api}/v1/auth/register`, {
      headers: { Origin: originForSurface('CUSTOMER') },
      data: {
        email: `clear.lga.${Date.now()}@tamiym.test`,
        password: e2eUsers.customer.password,
        firstName: 'Clear',
        lastName: 'Lga',
      },
    });
    expect(register.ok(), await register.text()).toBeTruthy();

    const page = await context.newPage();
    await page.goto('/dashboard/settings');
    const state = page.getByLabel('State');
    const lga = page.getByLabel('LGA');
    await expect(state).toBeEnabled();
    await page.getByLabel('City').fill('Ikeja');
    await page.getByLabel('Street Address').fill('1 Clear Street');
    // CI seeds Lagos with the LGA Ikeja: seed:e2e.
    await state.selectOption({ label: 'Lagos' });
    await expect(lga).toBeEnabled();
    await lga.selectOption({ label: 'Ikeja' });

    const addressForm = page.getByLabel('Street Address').locator('xpath=ancestor::form');
    const isAddressSave = (method: string[]) => (response: import('@playwright/test').Response) =>
      method.includes(response.request().method()) &&
      /\/v1\/users\/addresses(\/[^/]+)?$/.test(response.url());

    const created = page.waitForResponse(isAddressSave(['POST']));
    await addressForm.getByRole('button', { name: 'Save' }).click();
    const createdResponse = await created;
    expect(createdResponse.status()).toBeLessThan(300);
    const savedBody = (await createdResponse.json()) as { lgaId: string };
    expect(savedBody.lgaId).toEqual(expect.any(String));

    // Reload so the form is filled from the saved address; the LGA only shows once the
    // state is matched, so waiting for its value waits for the form to settle.
    await page.reload();
    await expect(lga).toHaveValue(savedBody.lgaId);
    await lga.selectOption({ value: '' });

    const cleared = page.waitForResponse(isAddressSave(['PATCH']));
    await addressForm.getByRole('button', { name: 'Save' }).click();
    const clearedResponse = await cleared;
    expect(clearedResponse.status()).toBeLessThan(300);
    expect(clearedResponse.request().postDataJSON()).toMatchObject({
      stateCode: 'LA',
      lgaId: null,
    });
    expect(await clearedResponse.json()).toMatchObject({
      stateCode: 'LA',
      lgaId: null,
      administrativeAreaLevel2: null,
    });

    // The saved address really has no LGA: a reload shows an empty select.
    await page.reload();
    await expect(page.getByLabel('Street Address')).toHaveValue('1 Clear Street');
    await expect(state).toHaveValue('LA');
    await expect(lga).toHaveValue('');

    await context.close();
  });
});
