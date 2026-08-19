import { request, type APIRequestContext } from '@playwright/test';
import { urls } from './identities';

export async function createApiContext(): Promise<APIRequestContext> {
  return request.newContext({
    baseURL: `${urls.api}/v1/`,
    extraHTTPHeaders: { Accept: 'application/json' },
  });
}

export async function apiLogin(
  api: APIRequestContext,
  email: string,
  password: string
): Promise<void> {
  const res = await api.post('auth/login', {
    data: { email, password },
  });
  if (!res.ok()) {
    throw new Error(`API login failed for ${email}: ${res.status()} ${await res.text()}`);
  }
}
