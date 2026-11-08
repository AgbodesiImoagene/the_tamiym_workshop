import { expect, type Page } from '@playwright/test';

/**
 * TTW-176: a full-page screenshot does not scroll, so images below the first
 * screen that load lazily (Next.js `<Image>` defaults to `loading="lazy"`) may
 * or may not be painted, depending on timing. The first Linux baselines came
 * out with an empty footer for that reason.
 *
 * Make every image eager, then wait until each one has loaded and the web
 * fonts are ready, so a baseline never depends on timing. The poll returns the
 * URLs still missing, so a failure names the image that never loaded.
 */
export async function waitForAllImages(page: Page): Promise<void> {
  await page.evaluate(() => {
    for (const image of Array.from(document.images)) {
      image.loading = 'eager';
    }
  });
  await expect
    .poll(
      () =>
        page.evaluate(() =>
          Array.from(document.images)
            .filter((image) => !image.complete || image.naturalWidth === 0)
            .map((image) => image.currentSrc || image.src)
        ),
      { message: 'every image on the page has loaded', timeout: 15_000 }
    )
    .toEqual([]);
  await page.evaluate(async () => {
    await document.fonts.ready;
  });
}
