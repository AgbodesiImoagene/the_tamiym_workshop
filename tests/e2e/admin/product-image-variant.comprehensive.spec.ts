import type { Page } from '@playwright/test';
import { expect, test } from '../fixtures/test';

/** Saves the image row of the "Catalog media" card and returns the stored variant id. */
async function saveImageVariant(page: Page): Promise<string | null> {
  const media = page.locator('[data-slot="card"]').filter({ hasText: 'Catalog media' });
  const saved = page.waitForResponse(
    (response) => response.request().method() === 'PATCH' && /\/images\/[^/]+$/.test(response.url())
  );
  await media.getByRole('button', { name: 'Save', exact: true }).click();
  const response = await saved;
  expect(response.ok()).toBeTruthy();
  return ((await response.json()) as { variantId: string | null }).variantId;
}

/**
 * TTW-165 — the admin product page opens for a product with images, and an
 * image can be linked to a variant and back to "All variants". Each run works
 * on a new product so the seeded catalogue is left untouched. The adminPage
 * fixture fails the test on any page or console error, which covers the crash.
 */
test.describe('Admin product image variant @comprehensive @admin', () => {
  test('an image links to a variant and back to all variants', async ({ adminPage }) => {
    await adminPage.goto('/admin/catalog/products/new');
    await adminPage.locator('#np-name').fill(`TTW-165 images ${Date.now()}`);
    await adminPage.getByRole('button', { name: 'Create product' }).click();
    await expect(adminPage).toHaveURL(/\/admin\/catalog\/products\/(?!new)[^/]+$/);

    // Two option values give two variants to choose from.
    const options = adminPage.locator('[data-slot="card"]').filter({ hasText: 'Options & values' });
    await options.getByPlaceholder('code', { exact: true }).fill('size');
    await options.getByPlaceholder('Name', { exact: true }).fill('Size');
    await options.getByRole('button', { name: 'Add option' }).click();
    const valueName = options.getByPlaceholder('Display name', { exact: true });
    await expect(valueName).toBeVisible();
    const valueCode = options.getByPlaceholder('code', { exact: true }).first();
    for (const [code, name] of [
      ['s', 'Small'],
      ['m', 'Medium'],
    ]) {
      await valueCode.fill(code);
      await valueName.fill(name);
      await options.getByRole('button', { name: 'Add value' }).click();
      await expect(valueName).toHaveValue('');
    }

    // The URL import creates the image row at once; the file is processed later.
    const media = adminPage.locator('[data-slot="card"]').filter({ hasText: 'Catalog media' });
    await media.getByPlaceholder('https://…').fill('https://example.com/ttw-165.png');
    await media.getByRole('button', { name: 'Queue import' }).click();

    const imageVariant = media.getByRole('combobox', { name: 'Image variant' });
    await expect(imageVariant).toHaveText('All variants');

    // The page also opens from scratch for a product that has an image.
    await adminPage.reload();
    await expect(imageVariant).toHaveText('All variants');

    // Link the image to a variant.
    await imageVariant.click();
    const choices = adminPage.getByRole('option');
    await expect(choices).toHaveCount(3);
    const sku = (await choices.nth(1).textContent())?.trim() ?? '';
    expect(sku).not.toBe('');
    await choices.nth(1).click();
    await expect(imageVariant).toHaveText(sku);
    expect(await saveImageVariant(adminPage)).toEqual(expect.any(String));
    await adminPage.reload();
    await expect(imageVariant).toHaveText(sku);

    // And back to no specific variant.
    await imageVariant.click();
    await adminPage.getByRole('option', { name: 'All variants' }).click();
    await expect(imageVariant).toHaveText('All variants');
    expect(await saveImageVariant(adminPage)).toBeNull();
    await adminPage.reload();
    await expect(imageVariant).toHaveText('All variants');
  });
});
