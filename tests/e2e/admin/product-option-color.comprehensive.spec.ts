import type { Page } from '@playwright/test';
import { expect, test } from '../fixtures/test';

/** Clicks `button` and returns the stored option or option value the API answers with. */
async function saved(
  page: Page,
  method: 'POST' | 'PATCH',
  url: RegExp,
  click: () => Promise<void>
) {
  const answered = page.waitForResponse(
    (response) => response.request().method() === method && url.test(response.url())
  );
  await click();
  const response = await answered;
  expect(response.ok()).toBeTruthy();
  return (await response.json()) as { code?: string; metadata?: { hex?: string } | null };
}

/** Types a colour name in the open picker and clicks the result with that exact name. */
async function pickColor(page: Page, name: string) {
  const search = page.getByRole('combobox', { name: 'Search colors' });
  await search.fill(name.toLowerCase());
  await page.getByRole('option', { name: new RegExp(`^${name} #`) }).click();
  await expect(search).toBeHidden();
}

/**
 * TTW-266 — an admin chooses a product colour by typing its name, and the hex code is
 * stored. Each run works on a new product so the seeded catalogue is left untouched.
 * The adminPage fixture fails the test on any page or console error.
 */
test.describe('Admin product option color @comprehensive @admin', () => {
  test('a color value is chosen by name and keeps its hex code', async ({ adminPage }) => {
    await adminPage.goto('/admin/catalog/products/new');
    await adminPage.locator('#np-name').fill(`TTW-266 colors ${Date.now()}`);
    await adminPage.getByRole('button', { name: 'Create product' }).click();
    await expect(adminPage).toHaveURL(/\/admin\/catalog\/products\/(?!new)[^/]+$/);

    const options = adminPage.locator('[data-slot="card"]').filter({ hasText: 'Options & values' });

    // The British spelling is stored as "color".
    await options.getByPlaceholder('code', { exact: true }).fill('colour');
    await options.getByPlaceholder('Name', { exact: true }).fill('Color');
    const option = await saved(adminPage, 'POST', /\/options$/, () =>
      options.getByRole('button', { name: 'Add option' }).click()
    );
    expect(option.code).toBe('color');

    // The color option has a picker instead of the raw JSON field.
    await expect(options.getByRole('columnheader', { name: 'Color' })).toBeVisible();
    await expect(options.getByPlaceholder('{"hex":"#000"}')).toHaveCount(0);

    await options.getByPlaceholder('code', { exact: true }).first().fill('GREEN');
    await options.getByPlaceholder('Display name', { exact: true }).fill('Green');
    await options.getByRole('button', { name: /^Color of the new value:/ }).click();
    await pickColor(adminPage, 'Green');
    const created = await saved(adminPage, 'POST', /\/values$/, () =>
      options.getByRole('button', { name: 'Add value' }).click()
    );
    expect(created.metadata).toEqual({ hex: '#008000' });

    await adminPage.reload();
    const stored = options.getByRole('button', { name: /^Color of Green:/ });
    await expect(stored).toHaveAccessibleName('Color of Green: Green #008000');

    // Change it to another colour and save the row.
    await stored.click();
    await pickColor(adminPage, 'Orange');
    const updated = await saved(adminPage, 'PATCH', /\/values\/[^/]+$/, () =>
      options
        .getByRole('row')
        .filter({ has: adminPage.getByRole('button', { name: /^Color of Green:/ }) })
        .getByRole('button', { name: 'Save', exact: true })
        .click()
    );
    expect(updated.metadata).toEqual({ hex: '#ffa500' });

    await adminPage.reload();
    await expect(stored).toHaveAccessibleName('Color of Green: Orange #ffa500');

    // Without a reload, a row follows what was saved: change it again, then turn the
    // option into another kind and read the stored data in the JSON field.
    await stored.click();
    await pickColor(adminPage, 'Navy');
    await saved(adminPage, 'PATCH', /\/values\/[^/]+$/, () =>
      options
        .getByRole('row')
        .filter({ has: adminPage.getByRole('button', { name: /^Color of Green:/ }) })
        .getByRole('button', { name: 'Save', exact: true })
        .click()
    );
    await expect(stored).toHaveAccessibleName('Color of Green: Navy #000080');
    await options.locator('input[value="color"]').fill('finish');
    await saved(adminPage, 'PATCH', /\/options\/[^/]+$/, () =>
      options.getByRole('button', { name: 'Save option' }).click()
    );
    await expect(options.getByPlaceholder('{"hex":"#000"}')).toHaveValue('{"hex":"#000080"}');
  });
});
