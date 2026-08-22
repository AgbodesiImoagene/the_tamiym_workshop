import { expect } from '@playwright/test';
import { test } from '../fixtures/test';
import {
  assertVisibleControlsEnabled,
  exerciseInternalLinks,
  openMobileNavIfPresent,
} from '../fixtures/interactions';
import { describeViewportMatrix } from '../fixtures/viewport-suite';

describeViewportMatrix('Web marketing navigation @comprehensive @web', () => {
  test('home page hero, CTAs, and header controls', async ({ page }) => {
    await page.goto('/');
    await expect(
      page.getByRole('heading', { name: /Printing Your Vision, Perfectly!/i })
    ).toBeVisible();

    await openMobileNavIfPresent(page);
    await assertVisibleControlsEnabled(page.locator('header'));

    await expect(page.getByRole('link', { name: /Get Started/i }).first()).toBeVisible();
    await expect(page.getByRole('link', { name: /Explore Categories/i })).toBeVisible();
    await expect(page.getByRole('link', { name: /View Workshop/i })).toBeVisible();
  });

  test('header and footer links navigate internally', async ({ page }) => {
    await page.goto('/');
    await openMobileNavIfPresent(page);
    await exerciseInternalLinks(page, page.locator('header'), { maxLinks: 6 });
    await exerciseInternalLinks(page, page.locator('footer'), { maxLinks: 6 });
  });

  test('about page renders and exposes navigation', async ({ page }) => {
    await page.goto('/about');
    await expect(
      page.getByRole('heading', { name: /Elevating Events, Effortlessly/i })
    ).toBeVisible();
    await assertVisibleControlsEnabled(page);
  });

  test('fundraiser landing CTAs are interactive', async ({ page }) => {
    await page.goto('/fundraiser');
    await expect(
      page.getByRole('heading', { name: /Raise funds with custom merch/i })
    ).toBeVisible();
    await expect(page.getByRole('link', { name: /Start A Fundraiser/i })).toBeVisible();
    await expect(page.getByRole('link', { name: /Get Started/i })).toBeVisible();
    await assertVisibleControlsEnabled(page);
  });
});
