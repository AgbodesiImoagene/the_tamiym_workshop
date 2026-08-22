import AxeBuilder from '@axe-core/playwright';
import { test, expect } from '../fixtures/test';
import { filterBlockingViolations } from '../fixtures/a11y';
import { describeViewportMatrix } from '../fixtures/viewport-suite';
import { E2E_CAMPAIGN_SLUG_ACTIVE } from '../fixtures/seed-data';

const REPRESENTATIVE_ROUTES = [
  { name: 'web-home', path: '/' },
  { name: 'web-fundraiser-list', path: '/fundraiser' },
  { name: 'web-fundraiser-detail', path: `/fundraiser/${E2E_CAMPAIGN_SLUG_ACTIVE}` },
  { name: 'web-login', path: '/auth/login' },
] as const;

describeViewportMatrix('Representative accessibility scans @comprehensive @a11y', () => {
  for (const route of REPRESENTATIVE_ROUTES) {
    test(`${route.name} has no unapproved critical or serious axe violations`, async ({ page }) => {
      await page.goto(route.path);
      await page.waitForLoadState('domcontentloaded');

      const results = await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
        .analyze();

      const blocking = filterBlockingViolations(results, route.path);
      expect(blocking, blocking.map((v) => `${v.id} (${v.impact}): ${v.help}`).join('\n')).toEqual(
        []
      );
    });
  }
});
