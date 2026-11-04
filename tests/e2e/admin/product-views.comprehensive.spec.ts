import { expect, test } from '../fixtures/test';

/**
 * TTW-009 — the product view forms reload their fields from the saved view
 * after each save, without a page reload. Each run works on a new product so
 * the seeded catalogue is left untouched.
 */
test.describe('Admin product views @comprehensive @admin', () => {
  test('view forms follow the saved views after create and save', async ({ adminPage }) => {
    await adminPage.goto('/admin/catalog/products/new');
    await adminPage.locator('#np-name').fill(`TTW-009 views ${Date.now()}`);
    await adminPage.getByRole('button', { name: 'Create product' }).click();
    await expect(adminPage).toHaveURL(/\/admin\/catalog\/products\/(?!new)[^/]+$/);

    // First view, from the empty-product form.
    const firstForm = adminPage.locator('[data-slot="card"]').filter({ hasText: 'Product views' });
    await firstForm.getByPlaceholder('front', { exact: true }).fill('front');
    await firstForm.getByPlaceholder('Front', { exact: true }).fill('Front');
    await firstForm.getByRole('button', { name: 'Create view' }).click();

    // Second view, asked to be the default, from the inline form.
    const addForm = adminPage.locator('[data-slot="card"]').filter({ hasText: 'Add another view' });
    const addSortOrder = addForm.getByRole('textbox').nth(2);
    const addDefault = addForm.getByRole('checkbox', { name: /Default view for this product/ });
    await expect(addSortOrder).toHaveValue('1');
    await addForm.getByPlaceholder('front', { exact: true }).fill('back');
    await addForm.getByPlaceholder('Front', { exact: true }).fill('Back');
    await addDefault.click();
    await expect(addDefault).toBeChecked();
    await addForm.getByRole('button', { name: 'Create view' }).click();

    // The form now proposes the next free sort order and no longer the default flag.
    await expect(adminPage.getByRole('tab', { name: 'Back' })).toBeVisible();
    await expect(addSortOrder).toHaveValue('2');
    await expect(addDefault).not.toBeChecked();

    // Saving a key with spaces shows the key as the server stored it.
    const settings = adminPage.locator('[data-slot="card"]').filter({ hasText: 'View settings' });
    const settingsKey = settings.getByRole('textbox').first();
    await expect(settingsKey).toHaveValue('back');
    await settingsKey.fill('Back Panel');
    await settings.getByRole('button', { name: 'Save view settings' }).click();
    await expect(settingsKey).toHaveValue('back_panel');
  });
});
