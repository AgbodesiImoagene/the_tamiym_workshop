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
  role: 'customer' | 'organiser' | 'admin',
  email: string,
  password: string
): Promise<void> {
  const surface: AuthSurface = role === 'admin' ? 'ADMIN' : 'CUSTOMER';
  const api = await createApiContext(surface);
  const { csrfToken } = await apiLogin(api, email, password, surface);
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

setup('authenticate organiser @smoke', async () => {
  await saveRoleState('organiser', e2eUsers.organiser.email, e2eUsers.organiser.password);
});

setup('authenticate admin @smoke', async () => {
  await saveRoleState('admin', e2eUsers.admin.email, e2eUsers.admin.password);
});
