import { expect, test } from '@playwright/test';
import { originForSurface } from '../fixtures/api';
import { e2eUsers, urls } from '../fixtures/identities';

/**
 * TTW-264: a customer without a phone number can save a new name (the form used to send an
 * empty phone, which the API refuses, and showed nothing). The phone is a country next to a field
 * that takes digits only. The test registers its own customer.
 */
test.describe('Profile personal details @comprehensive @app', () => {
  test('save a name with no phone, then a phone typed with extra characters', async ({
    browser,
  }) => {
    const context = await browser.newContext({ baseURL: urls.app });
    const register = await context.request.post(`${urls.api}/v1/auth/register`, {
      headers: { Origin: originForSurface('CUSTOMER') },
      data: {
        email: `profile.details.${Date.now()}@tamiym.test`,
        password: e2eUsers.customer.password,
        firstName: 'Ada',
        lastName: 'Obi',
      },
    });
    expect(register.ok(), await register.text()).toBeTruthy();

    const page = await context.newPage();
    await page.goto('/dashboard/profile');
    const firstName = page.getByLabel('First Name');
    await expect(firstName).toHaveValue('Ada');

    const form = firstName.locator('xpath=ancestor::form');
    const isProfileSave = (response: import('@playwright/test').Response) =>
      response.request().method() === 'PUT' && /\/v1\/users\/profile$/.test(response.url());

    // No phone: used to be refused by the API and to throw in the page.
    await firstName.fill('Adaeze');
    const nameSaved = page.waitForResponse(isProfileSave);
    await form.getByRole('button', { name: 'Save' }).click();
    expect((await nameSaved).status()).toBe(200);
    await expect(page.getByRole('alert')).toHaveCount(0);

    // The phone is a country and digits only: letters, spaces and dashes never reach the field,
    // and a local number with its leading 0 becomes the international one.
    await expect(page.getByRole('combobox', { name: 'Country calling code' })).toContainText(
      'Nigeria (+234)'
    );
    const phone = page.getByLabel('Phone');
    await phone.pressSequentially('abc0801-234 5678');
    await expect(phone).toHaveValue('08012345678');
    const phoneSaved = page.waitForResponse(isProfileSave);
    await form.getByRole('button', { name: 'Save' }).click();
    const saved = await phoneSaved;
    expect(saved.status()).toBe(200);
    expect(saved.request().postDataJSON()).toMatchObject({ phone: '+2348012345678' });

    // Reloaded: the saved number is shown as its country and its digits.
    await page.reload();
    await expect(page.getByLabel('First Name')).toHaveValue('Adaeze');
    await expect(page.getByRole('combobox', { name: 'Country calling code' })).toContainText(
      'Nigeria (+234)'
    );
    await expect(page.getByLabel('Phone')).toHaveValue('8012345678');

    // Another country, with a number that is not valid for it: refused in the page.
    await page.getByRole('combobox', { name: 'Country calling code' }).click();
    await page.getByLabel('Search country code').fill('44');
    await page.getByRole('option', { name: 'United Kingdom (+44)' }).click();
    await page.getByLabel('Phone').fill('123');
    await form.getByRole('button', { name: 'Save' }).click();
    await expect(page.getByText(/valid phone number for the selected country/i)).toBeVisible();
    await context.close();
  });
});
