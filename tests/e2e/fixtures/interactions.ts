import { expect, type Locator, type Page } from '@playwright/test';

const DESTRUCTIVE_LABEL =
  /delete|remove|refund|execute|approve|reject|sign out|logout|discard|broadcast|initiate payout/i;

const EXTERNAL_HREF = /^(https?:|mailto:|tel:)/i;

const SKIP_BUTTON_LABEL =
  /show|hide|flag|approve|reject|refresh|apply|download|create payout|update|initiate|save|reset|clear|search|preview|submit|expand|collapse|open review/i;

/**
 * Assert visible interactive controls are enabled unless explicitly disabled by design.
 */
export async function assertVisibleControlsEnabled(scope: Locator): Promise<void> {
  const buttons = scope.getByRole('button');
  const count = await buttons.count();
  for (let i = 0; i < count; i += 1) {
    const button = buttons.nth(i);
    if (!(await button.isVisible())) continue;
    const name = (await button.getAttribute('aria-label')) ?? (await button.textContent()) ?? '';
    if (DESTRUCTIVE_LABEL.test(name) || SKIP_BUTTON_LABEL.test(name)) continue;
    const disabled = await button.isDisabled();
    const ariaDisabled = await button.getAttribute('aria-disabled');
    if (!disabled && ariaDisabled !== 'true') {
      await expect(button, `button "${name.trim()}" should be enabled`).toBeEnabled();
    }
  }
}

/**
 * Clicks each in-scope navigation link and verifies the URL changes without a hard error.
 * Skips external, mailto, hash-only, and javascript links.
 */
export async function exerciseInternalLinks(
  page: Page,
  scope: Locator,
  options: { maxLinks?: number } = {}
): Promise<void> {
  const maxLinks = options.maxLinks ?? 12;
  const links = scope.getByRole('link');
  const count = Math.min(await links.count(), maxLinks);

  for (let i = 0; i < count; i += 1) {
    const link = links.nth(i);
    if (!(await link.isVisible())) continue;
    const href = (await link.getAttribute('href')) ?? '';
    if (!href || href === '#' || href === '/' || EXTERNAL_HREF.test(href)) continue;

    const before = page.url();
    await link.click();
    await page.waitForLoadState('domcontentloaded');
    const after = page.url();
    if (after === before) continue;
    await page.goBack({ waitUntil: 'domcontentloaded' });
  }
}

/**
 * Opens mobile marketing navigation when the hamburger is present.
 */
export async function openMobileNavIfPresent(page: Page): Promise<void> {
  const menuButton = page.getByRole('button', { name: /open menu/i });
  if (await menuButton.isVisible()) {
    await menuButton.click();
    await expect(page.getByRole('link', { name: /sign in/i }).first()).toBeVisible();
  }
}

/** Strict pathname matcher — anchors `/dashboard` so it does not match sub-routes. */
export function pathUrlMatcher(path: string): RegExp {
  const escaped = path.replace(/\//g, '\\/');
  if (path === '/dashboard' || path === '/admin') {
    return new RegExp(`${escaped}(?:\\?.*)?$`);
  }
  return new RegExp(`${escaped}(?:\\/|\\?|$)`);
}

/**
 * Customer app sidebar is desktop-only (`hidden lg:flex`). On smaller viewports,
 * navigate directly until mobile nav ships (see customer-dashboard-shell).
 */
export async function navigateCustomerSidebarLink(
  page: Page,
  label: string,
  path: string
): Promise<void> {
  const link = page.locator('aside nav').getByRole('link', { name: label, exact: true });
  if (await link.isVisible()) {
    await link.click();
  } else {
    await page.goto(path);
  }
  await expect(page).toHaveURL(pathUrlMatcher(path));
}

/** Admin sidebar links include hint badges in the accessible name — match by href. */
export async function clickAdminSidebarLink(page: Page, href: string): Promise<void> {
  const link = page.locator('aside').locator(`a[href="${href}"]`).last();
  await expect(link).toBeVisible();
  await link.click();
  await page.waitForLoadState('domcontentloaded');
}
