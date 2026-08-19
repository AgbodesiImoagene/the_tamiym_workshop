import { test as setup, expect } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createApiContext, apiLogin } from '../fixtures/api';
import { e2eUsers } from '../fixtures/identities';

const authDir = path.join(path.dirname(fileURLToPath(import.meta.url)), '../.auth');

setup.beforeAll(() => {
  fs.mkdirSync(authDir, { recursive: true });
});

async function saveRoleState(
  role: 'customer' | 'organiser' | 'admin',
  email: string,
  password: string
): Promise<void> {
  const api = await createApiContext();
  await apiLogin(api, email, password);
  const me = await api.get('auth/me');
  expect(me.ok(), `auth/me for ${email}`).toBeTruthy();
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
