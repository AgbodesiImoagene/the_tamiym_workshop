import { expect } from '@playwright/test';
import { test } from '../fixtures/test';

/**
 * TTW-102: a customer can remove what they added, undo and redo, reorder layers
 * and save the result.
 * Uses the seeded Classic Tee (`e2e-product-classic-tee`), which has one designable view.
 */
const TEE_PRODUCT_ID = 'e2e-product-classic-tee';

test.describe('Design workshop layers @app @critical', () => {
  test('add, delete, undo, redo, reorder and save', async ({ customerPage: page }) => {
    const first = `First ${Date.now()}`;
    const second = `Second ${Date.now()}`;

    await page.goto(`/dashboard/design/new/${TEE_PRODUCT_ID}`);
    const layers = page.getByRole('list', { name: 'Layers' });
    await expect(page.getByText('No layers yet')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Undo' })).toBeDisabled();
    await expect(page.getByRole('button', { name: 'Delete', exact: true })).toBeDisabled();

    // Add two text layers.
    for (const label of [first, second]) {
      await page.getByPlaceholder('Enter text…').fill(label);
      await page.getByRole('button', { name: 'Add to canvas' }).click();
      await expect(page.getByRole('button', { name: `Select ${label}` })).toBeVisible();
    }
    // The last one added is the top layer and is selected.
    await expect(layers.getByRole('listitem').first()).toContainText(second);
    await expect(page.getByRole('button', { name: 'Delete', exact: true })).toBeEnabled();

    // Delete the selected layer with the toolbar button, then undo and redo it.
    await page.getByRole('button', { name: 'Delete', exact: true }).click();
    await expect(page.getByRole('button', { name: `Select ${second}` })).toHaveCount(0);
    await page.getByRole('button', { name: 'Undo' }).click();
    await expect(page.getByRole('button', { name: `Select ${second}` })).toBeVisible();
    await page.getByRole('button', { name: 'Redo' }).click();
    await expect(page.getByRole('button', { name: `Select ${second}` })).toHaveCount(0);
    await page.getByRole('button', { name: 'Undo' }).click();
    await expect(page.getByRole('button', { name: `Select ${second}` })).toBeVisible();

    // Delete the first layer from the layer list with the keyboard, then bring it back.
    await page.getByRole('button', { name: `Select ${first}` }).click();
    await page.keyboard.press('Delete');
    await expect(page.getByRole('button', { name: `Select ${first}` })).toHaveCount(0);
    await page.keyboard.press('ControlOrMeta+z');
    await expect(page.getByRole('button', { name: `Select ${first}` })).toBeVisible();

    // Reorder: move the first layer to the top.
    await page.getByRole('button', { name: `Move ${first} up` }).click();
    await expect(layers.getByRole('listitem').first()).toContainText(first);

    // Remove a layer from its own list entry.
    await page.getByRole('button', { name: `Delete ${second}` }).click();
    await expect(page.getByRole('button', { name: `Select ${second}` })).toHaveCount(0);

    // Save: the design sent to the API holds the one layer that is left, and only that one.
    await page.getByLabel('Design name').fill(`Layers ${Date.now()}`);
    const created = page.waitForResponse(
      (response) => response.url().endsWith('/v1/designs') && response.request().method() === 'POST'
    );
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    const response = await created;
    expect(response.status()).toBe(201);
    const sent = response.request().postDataJSON() as {
      designData: {
        views: Record<string, { layerCount: number; fabricJson: { objects: { text: string }[] } }>;
      };
    };
    const view = Object.values(sent.designData.views)[0];
    expect(view.layerCount).toBe(1);
    expect(view.fabricJson.objects.map((o) => o.text)).toEqual([first]);

    // Not covered yet: opening the saved design again. /dashboard/design/<id>/edit answers
    // 404 on main, for a direct load and for the redirect right after the first save, because
    // the page fetches the design on the server without the customer's cookies. See the ticket.
  });
});
