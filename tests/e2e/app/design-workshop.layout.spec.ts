import { expect } from '@playwright/test';
import { test } from '../fixtures/test';

/**
 * TTW-105: the workshop follows the approved Figma layout: the dashboard sidebar, a left tool
 * rail, the open tool next to it, the canvas with the product photo behind the layers.
 * Layout only: the tools keep working as before.
 * Seeded Classic Tee (`e2e-product-classic-tee`): one designable view, with options.
 * Seeded Campus Hoodie (`e2e-product-campus-hoodie`): its front view has a product photo.
 */
const TEE_PRODUCT_ID = 'e2e-product-classic-tee';
const HOODIE_PRODUCT_ID = 'e2e-product-campus-hoodie';

test.describe('Design workshop layout @app', () => {
  test('sidebar, tool rail and tools', async ({ customerPage: page }) => {
    await page.goto(`/dashboard/design/new/${TEE_PRODUCT_ID}`);

    await expect(page.getByRole('heading', { name: 'Design Workshop' })).toBeVisible();
    // The dashboard sidebar, with Design as the page the customer is on.
    for (const name of ['Home', 'Products', 'Design', 'Orders', 'Fundraiser']) {
      await expect(page.getByRole('link', { name, exact: true })).toBeVisible();
    }

    const rail = page.getByRole('group', { name: 'Workshop tools' });
    await expect(rail.getByRole('button', { name: 'Upload' })).toBeVisible();
    await expect(rail.getByRole('button', { name: 'Add Text' })).toBeVisible();
    await expect(rail.getByRole('button', { name: 'Product Colors' })).toBeVisible();

    // Add Text is open first and still adds a text.
    const label = `Layout ${Date.now()}`;
    await page.getByPlaceholder('Enter text…').fill(label);
    await page.getByRole('button', { name: 'Add to canvas' }).click();
    await expect(page.getByRole('button', { name: `Select ${label}` })).toBeVisible();

    // Upload says what the app really accepts, not what Figma lists.
    await rail.getByRole('button', { name: 'Upload' }).click();
    await expect(page.getByText('PNG, JPEG or WebP · max 10 MB')).toBeVisible();
    await expect(page.getByText(/EPS|PDF|5 MB/)).toHaveCount(0);

    // Product Colors shows the product options.
    await rail.getByRole('button', { name: 'Product Colors' }).click();
    await expect(page.getByRole('button', { name: 'Choose image' })).toBeHidden();

    // Layers, undo, redo and the design name stay in reach whichever tool is open.
    await expect(page.getByRole('button', { name: `Select ${label}` })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Undo' })).toBeVisible();
    await expect(page.getByLabel('Design name')).toBeVisible();

    // Out of scope for this ticket, and not shown.
    for (const name of ['Add Product', 'Remove Product', 'Duplicate Product', 'Get Price']) {
      await expect(page.getByRole('button', { name })).toHaveCount(0);
    }
  });

  test('the product photo shows behind the canvas when the view has one', async ({
    customerPage: page,
  }) => {
    // The share of the canvas that is painted (pixels with an alpha above zero). The photo
    // fills the canvas, so a photo drawn off-centre (a quarter of it) shows up here.
    const paintedShare = () =>
      page.evaluate(() => {
        const canvas = document.querySelector<HTMLCanvasElement>('canvas.lower-canvas');
        const context = canvas?.getContext('2d');
        if (!canvas || !context) return 0;
        const { data } = context.getImageData(0, 0, canvas.width, canvas.height);
        let painted = 0;
        for (let i = 3; i < data.length; i += 4) if (data[i] > 0) painted++;
        return painted / (canvas.width * canvas.height);
      });

    await page.goto(`/dashboard/design/new/${HOODIE_PRODUCT_ID}`);
    await expect(page.getByRole('button', { name: 'Undo' })).toBeVisible();
    await expect.poll(paintedShare).toBeGreaterThan(0.99);

    await page.goto(`/dashboard/design/new/${TEE_PRODUCT_ID}`);
    await expect(page.getByRole('button', { name: 'Undo' })).toBeVisible();
    await expect.poll(paintedShare).toBe(0);
  });

  test('fits a phone screen', async ({ customerPage: page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`/dashboard/design/new/${TEE_PRODUCT_ID}`);

    const rail = page.getByRole('group', { name: 'Workshop tools' });
    await expect(rail.getByRole('button', { name: 'Add Text' })).toBeVisible();
    await expect(page.getByPlaceholder('Enter text…')).toBeVisible();

    // The canvas is reachable without scrolling past every panel.
    await expect(page.locator('canvas.lower-canvas')).toBeInViewport();

    const overflows = await page.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth
    );
    expect(overflows).toBe(false);
  });
});
