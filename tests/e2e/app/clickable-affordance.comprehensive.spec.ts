import { expect } from '@playwright/test';
import { test } from '../fixtures/test';

// TTW-261: clickable elements get a pointer cursor from the base CSS of apps/app, with no
// class on each control. The sidebar only exists from the `lg` breakpoint up.
test.describe('Clickable elements show a pointer @comprehensive @app', () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test('links and buttons show the hand, a disabled button shows not-allowed', async ({
    customerPage,
  }) => {
    await customerPage.goto('/dashboard');
    const link = customerPage
      .locator('aside nav')
      .getByRole('link', { name: 'Products', exact: true });
    await expect(link).toBeVisible();
    await expect(link).toHaveCSS('cursor', 'pointer');

    // A plain <button> and a disabled one, with no class: only the base CSS styles them.
    await customerPage.evaluate(() => {
      const make = (id: string, disabled: boolean) => {
        const button = document.createElement('button');
        button.id = id;
        button.textContent = id;
        button.disabled = disabled;
        document.body.appendChild(button);
      };
      make('e2e-plain-button', false);
      make('e2e-disabled-button', true);
    });
    await expect(customerPage.locator('#e2e-plain-button')).toHaveCSS('cursor', 'pointer');
    await expect(customerPage.locator('#e2e-disabled-button')).toHaveCSS('cursor', 'not-allowed');
  });
});
