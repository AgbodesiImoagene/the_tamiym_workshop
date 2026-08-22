import { expect } from '@playwright/test';
import { test } from '../fixtures/test';

/**
 * TTW-035 / TTW-053 — organiser campaign authoring smoke hook.
 * Full viewport-matrix coverage lives in campaign-authoring.comprehensive.spec.ts.
 */
test.describe('Organiser campaign authoring @smoke @app @ttw035', () => {
  test('fundraiser hub loads for organiser session', async ({ organiserPage }) => {
    await organiserPage.goto('/dashboard/fundraiser');
    await expect(organiserPage.getByRole('heading', { name: /Fundraiser/i })).toBeVisible();
  });
});
