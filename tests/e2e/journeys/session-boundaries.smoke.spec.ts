import { request } from '@playwright/test';
import { test, expect, urls } from '../fixtures/test';
import { originForSurface } from '../fixtures/api';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const authDir = path.join(path.dirname(fileURLToPath(import.meta.url)), '../.auth');

test.describe('Session boundary negatives @smoke', () => {
  test('anonymous visitor cannot open customer dashboard', async ({ browser }) => {
    const context = await browser.newContext({ baseURL: urls.app });
    const page = await context.newPage();
    await page.goto('/dashboard');
    await expect(page).toHaveURL(/\/auth\/login/);
    await context.close();
  });

  test('anonymous visitor cannot open admin overview', async ({ browser }) => {
    const context = await browser.newContext({ baseURL: urls.admin });
    const page = await context.newPage();
    await page.goto('/admin');
    await expect(page).toHaveURL(/\/auth\/login/);
    await context.close();
  });

  test('customer storage is denied on admin overview', async ({ browser }) => {
    const context = await browser.newContext({
      baseURL: urls.admin,
      storageState: path.join(authDir, 'customer.json'),
    });
    const page = await context.newPage();
    await page.goto('/admin');
    // AdminShell logs out non-admins and sends them to /auth/login
    await expect(page).toHaveURL(/\/auth\/login/);
    await context.close();
  });

  test('customer API token cannot list admin orders', async () => {
    // Reuse setup storage so we do not burn login rate limits during smoke.
    // Origin must match the customer surface (TTW-020) or the request 401s
    // on surface mismatch before the role check ever runs.
    const api = await request.newContext({
      baseURL: `${urls.api}/v1/`,
      extraHTTPHeaders: { Origin: originForSurface('CUSTOMER') },
      storageState: path.join(authDir, 'customer.json'),
    });
    const res = await api.get('admin/orders');
    expect(res.status()).toBe(403);
    await api.dispose();
  });

  test('admin surface cookie is rejected on the customer origin (TTW-020)', async () => {
    // The admin storage state's access cookie is scoped to the ADMIN surface;
    // presenting it against the customer Origin must not authenticate.
    const api = await request.newContext({
      baseURL: `${urls.api}/v1/`,
      extraHTTPHeaders: { Origin: originForSurface('CUSTOMER') },
      storageState: path.join(authDir, 'admin.json'),
    });
    const res = await api.get('auth/me');
    expect(res.status()).toBe(401);
    await api.dispose();
  });
});

test.describe('Paystack simulator controls @smoke', () => {
  test('supports duplicate and delayed webhook enqueue/delivery', async ({ paystack }) => {
    paystack.enqueue(
      'charge.success',
      { reference: 'psk_ref_1', amount: 1000 },
      { duplicate: true, delayMs: 5_000 }
    );
    expect(paystack.getPending()).toHaveLength(2);
    expect(paystack.deliverNext()).toBeNull(); // delayed
    const flushed = paystack.flushIgnoringDelays();
    expect(flushed).toHaveLength(2);
    expect(flushed[0].event).toBe('charge.success');
    expect(flushed[0].id).not.toBe(flushed[1].id);
    expect(paystack.getDelivered()).toHaveLength(2);
  });
});
