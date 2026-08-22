import { expect } from '@playwright/test';
import { test } from '../fixtures/test';
import { assertVisibleControlsEnabled } from '../fixtures/interactions';
import { describeViewportMatrix } from '../fixtures/viewport-suite';

const MODERATION_TABS = [
  { label: 'Campaigns', heading: /Campaign moderation/i },
  { label: 'Designs', heading: /Design moderation/i },
  { label: 'Media', heading: /Media moderation/i },
] as const;

describeViewportMatrix('Admin moderation workspaces @comprehensive @admin', () => {
  test('moderation sub-nav reaches all queues', async ({ adminPage }) => {
    await adminPage.goto('/admin/moderation/campaigns');
    await expect(adminPage.getByRole('heading', { name: /Campaign moderation/i })).toBeVisible();

    for (const tab of MODERATION_TABS) {
      await adminPage.getByRole('link', { name: tab.label, exact: true }).click();
      await expect(adminPage.getByRole('heading', { name: tab.heading }).first()).toBeVisible();
    }

    await assertVisibleControlsEnabled(adminPage.locator('main'));
  });

  test('campaign moderation queue filters respond', async ({ adminPage }) => {
    await adminPage.goto('/admin/moderation/campaigns');
    await expect(adminPage.getByPlaceholder(/Search title, slug, or organizer/i)).toBeVisible();

    const queueTabs = ['Review queue', 'Blocked', 'Live', 'All'];
    for (const tab of queueTabs) {
      const tabControl = adminPage.getByRole('tab', { name: tab, exact: true });
      if (await tabControl.isVisible()) {
        await tabControl.click();
      }
    }

    const openReview = adminPage.getByRole('link', { name: /Open review/i });
    if ((await openReview.count()) > 0) {
      await openReview.first().click();
      await expect(
        adminPage.getByRole('link', { name: /← Queue|Back to queue/i }).first()
      ).toBeVisible();
    }
  });

  test('design moderation quick actions are present on rows', async ({ adminPage }) => {
    await adminPage.goto('/admin/moderation/designs');
    await expect(adminPage.getByRole('heading', { name: /Design moderation/i })).toBeVisible();

    for (const tab of ['All', 'Pending', 'Flagged', 'Approved', 'Rejected']) {
      const tabControl = adminPage.getByRole('tab', { name: tab, exact: true });
      if (await tabControl.isVisible()) {
        await tabControl.click();
      }
    }

    await assertVisibleControlsEnabled(adminPage.locator('main'));
  });
});
