import { expect, test } from '@playwright/test';
import { originForSurface } from '../fixtures/api';
import { e2eUsers, urls } from '../fixtures/identities';

// A 1×1 PNG: tiny, but a real image the API decodes and compresses.
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
  'base64'
);

/**
 * TTW-263: a customer uploads a profile picture on Profile, sees it in the page and in the
 * sidebar, keeps it after a reload, and can remove it. The test registers its own customer,
 * so it never touches the shared ones. Needs the private bucket (MinIO) to be running.
 */
test.describe('Profile picture @comprehensive @app', () => {
  test('upload, see it in the sidebar, reload, remove', async ({ browser }) => {
    const context = await browser.newContext({
      baseURL: urls.app,
      viewport: { width: 1440, height: 900 },
    });
    const register = await context.request.post(`${urls.api}/v1/auth/register`, {
      headers: { Origin: originForSurface('CUSTOMER') },
      data: {
        email: `profile.picture.${Date.now()}@tamiym.test`,
        password: e2eUsers.customer.password,
        firstName: 'Pic',
        lastName: 'Ture',
      },
    });
    expect(register.ok(), await register.text()).toBeTruthy();

    const page = await context.newPage();
    await page.goto('/dashboard/profile');
    const sidebar = page.locator('aside');
    await expect(sidebar.getByText('PI', { exact: true })).toBeVisible();
    await expect(sidebar.getByRole('img', { name: /profile picture/i })).toHaveCount(0);

    // A file that is not an image is refused in the page, with a reason.
    await page.getByLabel('Profile picture file').setInputFiles({
      name: 'notes.pdf',
      mimeType: 'application/pdf',
      buffer: Buffer.from('%PDF-1.4'),
    });
    await expect(page.getByText('Choose a JPEG, PNG or WebP image.')).toBeVisible();

    await page.getByLabel('Profile picture file').setInputFiles({
      name: 'me.png',
      mimeType: 'image/png',
      buffer: PNG,
    });
    // The same picture, in the page and in the sidebar.
    await expect(page.getByRole('img', { name: /profile picture/i })).toHaveCount(2);
    await expect(sidebar.getByRole('img', { name: /profile picture/i })).toBeVisible();

    // The browser really loaded the picture (a visible <img> alone does not prove it).
    await expect
      .poll(() =>
        sidebar
          .getByRole('img', { name: /profile picture/i })
          .evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth > 0)
      )
      .toBe(true);

    // The picture is really served by the API (private, authenticated), as a WebP.
    const src = await sidebar.getByRole('img', { name: /profile picture/i }).getAttribute('src');
    const served = await context.request.get(src as string, {
      headers: { Origin: originForSurface('CUSTOMER') },
    });
    expect(served.ok()).toBeTruthy();
    expect(served.headers()['content-type']).toContain('image/webp');

    await page.reload();
    await expect(sidebar.getByRole('img', { name: /profile picture/i })).toBeVisible();

    await page.getByRole('button', { name: 'Remove picture' }).click();
    await expect(sidebar.getByRole('img', { name: /profile picture/i })).toHaveCount(0);
    await expect(sidebar.getByText('PI', { exact: true })).toBeVisible();
    await page.reload();
    await expect(sidebar.getByRole('img', { name: /profile picture/i })).toHaveCount(0);
    await context.close();
  });
});
