import { expect } from '@playwright/test';
import { test } from '../fixtures/test';
import { assertVisibleControlsEnabled } from '../fixtures/interactions';
import { describeViewportMatrix } from '../fixtures/viewport-suite';

describeViewportMatrix('Organiser campaign authoring @comprehensive @app @critical', () => {
  test('fundraiser hub controls and editor entry', async ({ organiserPage }) => {
    await organiserPage.goto('/dashboard/fundraiser');
    await expect(organiserPage.getByRole('heading', { name: /Fundraiser/i })).toBeVisible();

    const openEditor = organiserPage.getByTestId('campaign-open-editor');
    if ((await openEditor.count()) > 0) {
      await openEditor.first().click();
      await expect(organiserPage.getByTestId('campaign-authoring-editor')).toBeVisible();
      await expect(organiserPage.getByRole('link', { name: /Back to fundraisers/i })).toBeVisible();
      await expect(organiserPage.getByRole('button', { name: /Save basics/i })).toBeVisible();
      await assertVisibleControlsEnabled(organiserPage.getByTestId('campaign-authoring-editor'));
    } else {
      await expect(organiserPage.getByPlaceholder('Draft fundraiser title')).toBeVisible();
      await expect(
        organiserPage.getByRole('button', { name: /Create draft fundraiser/i })
      ).toBeVisible();
    }
  });

  test('campaign editor preview and submit modals open', async ({ organiserPage }) => {
    await organiserPage.goto('/dashboard/fundraiser');
    const openEditor = organiserPage.getByTestId('campaign-open-editor');
    test.skip((await openEditor.count()) === 0, 'No draft campaign seeded for organiser');

    await openEditor.first().click();
    await expect(organiserPage.getByTestId('campaign-authoring-editor')).toBeVisible();

    const preview = organiserPage.getByTestId('campaign-preview-open');
    if (await preview.isVisible()) {
      await preview.click();
      await expect(organiserPage.getByRole('dialog')).toBeVisible();
      await organiserPage.keyboard.press('Escape');
    }

    const submitOpen = organiserPage.getByTestId('campaign-submit-open');
    if (await submitOpen.isVisible()) {
      await submitOpen.click();
      await expect(organiserPage.getByTestId('campaign-submit-confirm')).toBeVisible();
      await organiserPage.keyboard.press('Escape');
    }
  });
});
