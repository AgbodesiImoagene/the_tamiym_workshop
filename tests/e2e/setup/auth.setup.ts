import { test as setup, expect } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createApiContext, apiLogin, type AuthSurface } from '../fixtures/api';
import { e2eUsers } from '../fixtures/identities';

const authDir = path.join(path.dirname(fileURLToPath(import.meta.url)), '../.auth');

setup.beforeAll(() => {
  fs.mkdirSync(authDir, { recursive: true });
});

// ADMIN authenticates on the admin surface only; CUSTOMER/ORGANIZER share the
// customer surface (TTW-020). The saved storage state's Origin-derived
// surface must match, or later `auth/me` cookie reads will 401.
async function saveRoleState(
  role:
    | 'customer'
    | 'customer-undeliverable'
    | 'customer-undeliverable-lga'
    | 'customer-checkout-idempotency'
    | 'customer-checkout-instructions'
    | 'customer-checkout-note'
    | 'customer-design-order'
    | 'customer-order-cancel'
    | 'organiser'
    | 'admin',
  email: string,
  password: string,
  totpSecret?: string
): Promise<void> {
  const surface: AuthSurface = role === 'admin' ? 'ADMIN' : 'CUSTOMER';
  const api = await createApiContext(surface);
  const { csrfToken } = await apiLogin(api, email, password, surface, totpSecret);
  const me = await api.get('auth/me');
  expect(me.ok(), `auth/me for ${email}`).toBeTruthy();
  // A frontend that never saw the login response recovers the token here, so
  // auth/me must echo the one the session already has (TTW-020).
  expect((await me.json()).csrf_token, `auth/me csrf_token for ${email}`).toBe(csrfToken);
  await api.storageState({ path: path.join(authDir, `${role}.json`) });
  await api.dispose();
}

setup('authenticate customer @smoke', async () => {
  await saveRoleState('customer', e2eUsers.customer.email, e2eUsers.customer.password);
});

setup('authenticate customer with an undeliverable address', async () => {
  await saveRoleState(
    'customer-undeliverable',
    e2eUsers.customerUndeliverable.email,
    e2eUsers.customerUndeliverable.password
  );
});

setup('authenticate customer with a deactivated LGA', async () => {
  await saveRoleState(
    'customer-undeliverable-lga',
    e2eUsers.customerUndeliverableLga.email,
    e2eUsers.customerUndeliverableLga.password
  );
});

for (const [role, user] of [
  ['customer-checkout-idempotency', e2eUsers.checkoutIdempotency],
  ['customer-checkout-instructions', e2eUsers.checkoutInstructions],
  ['customer-checkout-note', e2eUsers.checkoutNote],
  ['customer-design-order', e2eUsers.designOrder],
  ['customer-order-cancel', e2eUsers.orderCancel],
] as const) {
  setup(`authenticate ${role}`, async () => {
    await saveRoleState(role, user.email, user.password);
  });
}

setup('authenticate organiser @smoke', async () => {
  await saveRoleState('organiser', e2eUsers.organiser.email, e2eUsers.organiser.password);
});

setup('authenticate admin @smoke', async () => {
  await saveRoleState(
    'admin',
    e2eUsers.admin.email,
    e2eUsers.admin.password,
    e2eUsers.admin.totpSecret
  );
});
