import { test, expect } from '../fixtures/test';
import { waitForAllImages } from '../fixtures/visual';

test.describe('Visual regression mobile @visual @web', () => {
  test('home page mobile baseline', async ({ page }) => {
    await page.goto('/');
    await expect(
      page.getByRole('heading', { name: /Printing Your Vision, Perfectly!/i })
    ).toBeVisible();
    await waitForAllImages(page);
    await expect(page).toHaveScreenshot('web-home-mobile.png', {
      fullPage: true,
      maxDiffPixelRatio: 0.01,
    });
  });
});
