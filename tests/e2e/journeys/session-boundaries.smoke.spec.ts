import { request } from '@playwright/test';
import { test, expect, urls } from '../fixtures/test';
import { csrfStorageKey, originForSurface } from '../fixtures/api';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const authDir = path.join(path.dirname(fileURLToPath(import.meta.url)), '../.auth');
const DISALLOWED_ORIGIN = 'http://evil.example.com';

/** API context bound to a saved session, with an explicit Origin header. */
async function apiContextFor(role: 'customer' | 'admin', origin: string) {
  return request.newContext({
    baseURL: `${urls.api}/v1/`,
    extraHTTPHeaders: { Origin: origin },
    storageState: path.join(authDir, `${role}.json`),
  });
}

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

  test('cross-site logout cannot end a cookie session (TTW-020)', async () => {
    const evil = await apiContextFor('customer', DISALLOWED_ORIGIN);
    // A cross-site page holds no CSRF token, and the Origin is not on the
    // surface allowlist either, so the forced logout is refused.
    expect((await evil.post('auth/logout')).status()).toBe(403);
    await evil.dispose();

    const legitimate = await apiContextFor('customer', originForSurface('CUSTOMER'));
    expect((await legitimate.get('auth/me')).status()).toBe(200);
    await legitimate.dispose();
  });

  test('same-origin logout without the CSRF header is refused (TTW-020)', async () => {
    const api = await apiContextFor('customer', originForSurface('CUSTOMER'));
    expect((await api.post('auth/logout')).status()).toBe(403);

    // Still signed in, and the token needed to log out for real is available
    // from auth/me — the recovery path frontends use after a page load.
    const me = await api.get('auth/me');
    expect(me.status()).toBe(200);
    expect((await me.json()).csrf_token).toEqual(expect.any(String));
    await api.dispose();
  });
});

test.describe('CSRF token storage @smoke', () => {
  test('customer app stores the API CSRF token in sessionStorage', async ({ customerPage }) => {
    await customerPage.goto('/dashboard');
    await expect(
      customerPage.getByRole('heading', { name: /Welcome To Your Workshop/i })
    ).toBeVisible();

    // The dashboard's auth/me call is what seeds the token for a tab that
    // never saw a login response (TTW-020).
    const stored = await customerPage.evaluate(
      (key) => window.sessionStorage.getItem(key),
      csrfStorageKey('CUSTOMER')
    );
    expect(stored).toEqual(expect.any(String));

    // It is the token the API expects back in the CSRF header, i.e. the same
    // value as the session's CSRF cookie.
    const api = await apiContextFor('customer', originForSurface('CUSTOMER'));
    const me = await api.get('auth/me');
    expect((await me.json()).csrf_token).toBe(stored);
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
