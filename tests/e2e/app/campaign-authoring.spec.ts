import { expect } from '@playwright/test';
import { test } from '../fixtures/test';

/**
 * TTW-035 Playwright hooks (deferred matrix).
 * Slice 1 ships API + editor UI; full author→preview→submit browser coverage
 * is deferred when heavy. Keep these testids stable for the matrix:
 * - [data-testid="campaign-open-editor"]
 * - [data-testid="campaign-authoring-editor"]
 * - [data-testid="campaign-offer-row"]
 * - [data-testid="campaign-preview-open"]
 * - [data-testid="campaign-submit-open"]
 * - [data-testid="campaign-submit-confirm"]
 */
test.describe('Organiser campaign authoring @ttw035', () => {
  test.skip(
    true,
    'Full Playwright authoring matrix deferred from TTW-035 slice 1',
  );

  test('DRAFT editor loads from fundraiser list @smoke', async ({ page }) => {
    await page.goto('/dashboard/fundraiser');
    await page.getByTestId('campaign-open-editor').first().click();
    await expect(page.getByTestId('campaign-authoring-editor')).toBeVisible();
  });
});
