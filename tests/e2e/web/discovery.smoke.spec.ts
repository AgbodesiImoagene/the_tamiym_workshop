import { test, expect } from '../fixtures/test';

const WEB_ORIGIN = process.env.PLAYWRIGHT_WEB_URL ?? 'http://localhost:3000';

test.describe('Discovery regression smoke @smoke @discovery @web', () => {
  test('home exposes canonical, social preview, and organization JSON-LD', async ({ page }) => {
    await page.goto('/');

    const canonical = page.locator('link[rel="canonical"]');
    await expect(canonical).toHaveAttribute('href', new RegExp(`^${WEB_ORIGIN}/?$`));
    await expect(page.locator('meta[property="og:image"]')).toHaveCount(1);
    await expect(page.locator('meta[name="twitter:card"]')).toHaveAttribute(
      'content',
      'summary_large_image'
    );

    const jsonLd = page.locator('script[type="application/ld+json"]');
    await expect(jsonLd.first()).toBeAttached();
    const payloads = await jsonLd.allTextContents();
    expect(payloads.some((text) => text.includes('"@type":"Organization"'))).toBe(true);
  });

  test('auth surfaces are not indexable', async ({ page }) => {
    await page.goto('/auth/login');
    const robots = page.locator('meta[name="robots"]');
    await expect(robots).toHaveAttribute('content', /noindex/i);
  });

  test('robots.txt blocks private prefixes and advertises sitemap', async ({ request }) => {
    const response = await request.get('/robots.txt');
    expect(response.ok()).toBeTruthy();
    const body = await response.text();
    expect(body).toMatch(/Disallow:\s*\/auth\//);
    expect(body).toMatch(/Sitemap:\s*http/);
    expect(body).toMatch(/GPTBot/);
  });

  test('sitemap lists public marketing paths', async ({ request }) => {
    const response = await request.get('/sitemap.xml');
    expect(response.ok()).toBeTruthy();
    const body = await response.text();
    expect(body).toContain('/fundraiser');
    expect(body).toContain('/solutions/bulk');
    expect(body).not.toContain('/auth/login');
  });

  test('llms.txt documents crawler policy boundaries', async ({ request }) => {
    const response = await request.get('/llms.txt');
    expect(response.ok()).toBeTruthy();
    const body = await response.text();
    expect(body).toContain('Tamiym Workshop');
    expect(body).toContain('/auth/');
  });
});
