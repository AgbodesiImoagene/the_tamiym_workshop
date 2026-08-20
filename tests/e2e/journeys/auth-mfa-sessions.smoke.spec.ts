import { request, test, expect } from '@playwright/test';
import { apiLogin, createApiContext, originForSurface } from '../fixtures/api';
import { e2eUsers, urls } from '../fixtures/identities';

type SessionRow = {
  id: string;
  authSurface?: string;
  current?: boolean;
};

/**
 * TTW-023 — session list/revoke + admin MFA challenge over the HTTP API.
 * Uses fresh logins so shared Playwright storage states stay valid for siblings.
 */
test.describe('Auth sessions and MFA @smoke @auth', () => {
  test('customer can list sessions and revoke the current one', async () => {
    const api = await createApiContext('CUSTOMER');
    const { csrfToken } = await apiLogin(
      api,
      e2eUsers.customer.email,
      e2eUsers.customer.password,
      'CUSTOMER'
    );

    const list = await api.get('auth/sessions');
    expect(list.ok(), await list.text()).toBeTruthy();
    const sessions = (await list.json()) as SessionRow[];
    expect(Array.isArray(sessions)).toBeTruthy();
    expect(sessions.length).toBeGreaterThan(0);

    const current = sessions.find((row) => row.current) ?? sessions[0]!;
    const revoke = await api.delete(`auth/sessions/${current.id}`, {
      headers: { 'X-CSRF-Token': csrfToken },
    });
    expect(revoke.ok(), await revoke.text()).toBeTruthy();

    const me = await api.get('auth/me');
    expect(me.status()).toBe(401);
    await api.dispose();
  });

  test('admin MFA recovery code completes session over HTTP', async ({}, testInfo) => {
    // UI recovery fill is blocked by a controlled RHF quirk in Chromium CI;
    // cover the recover contract here with seeded approver codes.
    const recoveryCode =
      e2eUsers.adminApprover.recoveryCodes[
        Math.min(testInfo.retry, e2eUsers.adminApprover.recoveryCodes.length - 1)
      ]!;

    const api = await createApiContext('ADMIN');
    const login = await api.post('auth/admin/login', {
      data: {
        email: e2eUsers.adminApprover.email,
        password: e2eUsers.adminApprover.password,
      },
    });
    expect(login.ok(), await login.text()).toBeTruthy();
    const challenge = (await login.json()) as {
      mfa?: { status?: string };
      mfa_token?: string;
    };
    expect(challenge.mfa?.status).toBe('CHALLENGE_REQUIRED');

    const recover = await api.post('auth/admin/mfa/recover', {
      data: {
        mfa_token: challenge.mfa_token,
        recovery_code: recoveryCode,
      },
    });
    expect(recover.ok(), await recover.text()).toBeTruthy();
    const session = (await recover.json()) as { csrf_token?: string };
    expect(typeof session.csrf_token).toBe('string');
    expect((await api.get('auth/me')).ok()).toBeTruthy();
    await api.dispose();
  });
});

test.describe('Verify-to-checkout gate @smoke @auth', () => {
  test('unverified customer can register but cannot create an order', async () => {
    const api = await request.newContext({
      baseURL: `${urls.api}/v1/`,
      extraHTTPHeaders: {
        Accept: 'application/json',
        Origin: originForSurface('CUSTOMER'),
      },
    });

    const email = `unverified.${Date.now()}@tamiym.test`;
    const register = await api.post('auth/register', {
      data: {
        email,
        password: e2eUsers.customer.password,
        firstName: 'Unverified',
        lastName: 'Buyer',
      },
    });
    expect(register.ok(), await register.text()).toBeTruthy();
    const body = (await register.json()) as { csrf_token?: string };
    expect(typeof body.csrf_token).toBe('string');

    const order = await api.post('orders', {
      headers: { 'X-CSRF-Token': body.csrf_token ?? '' },
      data: {
        shippingAddressId: '00000000-0000-4000-8000-000000000001',
        items: [{ variantId: '00000000-0000-4000-8000-000000000002', quantity: 1 }],
      },
    });
    expect(order.status()).toBe(403);
    const err = (await order.json()) as { code?: string; action?: string };
    expect(err.code).toBe('EMAIL_NOT_VERIFIED');
    expect(err.action).toBe('CREATE_ORDER');

    await api.dispose();
  });
});
