import { deflateSync, crc32 } from 'node:zlib';
import { expect } from '@playwright/test';
import { originForSurface } from '../fixtures/api';
import { urls } from '../fixtures/identities';
import { test } from '../fixtures/test';

/**
 * TTW-104: the workshop warns, without blocking, when an image would print blurry. Uses the
 * seeded Classic Tee (`e2e-product-classic-tee`), whose front view has no print area, so the
 * reference is the whole 600 px canvas: an image added at the default scale 0.5 has 1200
 * source pixels across it (the threshold, no warning), and enlarging it goes below.
 */
const TEE_PRODUCT_ID = 'e2e-product-classic-tee';
const IMAGE_SIZE = 200;

/** A valid solid-colour PNG of the given size (the workshop only needs real image bytes). */
function solidPng(size: number): Buffer {
  const chunk = (type: string, data: Buffer) => {
    const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
    const length = Buffer.alloc(4);
    length.writeUInt32BE(data.length);
    const checksum = Buffer.alloc(4);
    checksum.writeUInt32BE(crc32(body));
    return Buffer.concat([length, body, checksum]);
  };
  const header = Buffer.alloc(13);
  header.writeUInt32BE(size, 0);
  header.writeUInt32BE(size, 4);
  header[8] = 8; // bit depth
  header[9] = 2; // RGB
  const row = Buffer.concat([Buffer.from([0]), Buffer.alloc(size * 3, 0x7f)]);
  const raw = Buffer.concat(Array.from({ length: size }, () => row));
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

test.describe('Design workshop low-resolution warning @app', () => {
  test('a small image enlarged is flagged without blocking anything, and still after a reload', async ({
    customerPage: page,
  }) => {
    await page.goto(`/dashboard/design/new/${TEE_PRODUCT_ID}`);

    // Upload a small image: at its default size it is dense enough, so no warning yet.
    // The image tool stays disabled until the canvas is ready; a file sent before would be lost.
    await expect(page.getByRole('button', { name: 'Choose image' })).toBeEnabled();
    const uploaded = page.waitForResponse((response) =>
      response.url().endsWith('/v1/design-assets/upload')
    );
    await page.locator('#image-tool-input').setInputFiles({
      name: 'small-logo.png',
      mimeType: 'image/png',
      buffer: solidPng(IMAGE_SIZE),
    });
    const select = page.getByRole('button', { name: 'Select Image' });
    await expect(select).toBeVisible();
    await expect(page.getByText('May print blurry', { exact: true })).toHaveCount(0);
    await expect(page.getByRole('status')).toHaveCount(0);

    // Enlarge it from its bottom-right corner. It lands at the canvas origin at scale 0.5, so
    // that corner is at 100,100 (the image is 200 px wide).
    const canvas = page.locator('.upper-canvas').first();
    // A point of the 600 px canvas on the page. The canvas moves a little after a reload, so
    // its position is read each time.
    const at = async (x: number, y: number) => {
      // Clicking a layer in the list can scroll the page: bring the canvas back into view.
      await page.evaluate(() => window.scrollTo(0, 0));
      const box = await canvas.boundingBox();
      expect(box).not.toBeNull();
      const scale = box!.width / 600;
      return { x: box!.x + x * scale, y: box!.y + y * scale };
    };
    const corner = await at(IMAGE_SIZE * 0.5, IMAGE_SIZE * 0.5);
    const target = await at(400, 400); // scale 2: 300 source pixels across the canvas
    await select.click();
    await page.mouse.move(corner.x, corner.y);
    await page.mouse.down();
    await page.mouse.move(target.x, target.y, { steps: 12 });
    await page.mouse.up();

    // It is now flagged in the list and explained next to the canvas, and nothing is blocked.
    await expect(page.getByText('May print blurry', { exact: true })).toBeVisible();
    await expect(page.getByRole('status')).toHaveText(
      'This image may print blurry. Make it smaller or upload a larger image.'
    );
    await expect(page.getByRole('button', { name: 'Save', exact: true })).toBeEnabled();
    await expect(page.getByRole('button', { name: 'Add to canvas' })).toBeEnabled();

    // The API processes an upload in the background and refuses a design whose image is not
    // ready yet (DESIGN_ASSET_NOT_READY), so wait until the resized rendition can be read.
    const { designAssetId } = (await (await uploaded).json()) as { designAssetId: string };
    await expect
      .poll(
        async () =>
          (
            await page.request.get(
              `${urls.api}/v1/design-assets/${designAssetId}/file?variant=display`,
              { headers: { Origin: originForSurface('CUSTOMER') } }
            )
          ).status(),
        { timeout: 30_000 }
      )
      .toBe(200);

    // Saved and reopened, the same design shows the same warning.
    await page.getByLabel('Design name').fill(`Low resolution ${Date.now()}`);
    const saved = page.waitForResponse(
      (response) => response.url().endsWith('/v1/designs') && response.request().method() === 'POST'
    );
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    const savedResponse = await saved;
    expect(savedResponse.status(), await savedResponse.text()).toBe(201);
    await expect(page).toHaveURL(/\/dashboard\/design\/[^/]+\/edit/);
    await page.reload();
    await expect(page.getByRole('button', { name: 'Select Image' })).toBeVisible();
    await expect(page.getByText('May print blurry', { exact: true })).toBeVisible();
  });
});
