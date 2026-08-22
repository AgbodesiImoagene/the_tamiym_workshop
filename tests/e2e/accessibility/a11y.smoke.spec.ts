import AxeBuilder from '@axe-core/playwright';
import { test, expect } from '../fixtures/test';
import { filterBlockingViolations } from '../fixtures/a11y';

test.describe('Accessibility smoke @a11y @web', () => {
  test('home page has no unapproved critical or serious axe violations', async ({ page }) => {
    await page.goto('/');
    await expect(
      page.getByRole('heading', { name: /Printing Your Vision, Perfectly!/i })
    ).toBeVisible();

    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .analyze();

    const blocking = filterBlockingViolations(results, '/');
    expect(blocking, blocking.map((v) => `${v.id} (${v.impact}): ${v.help}`).join('\n')).toEqual(
      []
    );
  });
});
