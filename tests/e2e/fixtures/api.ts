import { request, type APIRequestContext } from '@playwright/test';
import { urls } from './identities';

/** Auth surface (TTW-020): must match the surface a session's cookies were issued for. */
export type AuthSurface = 'CUSTOMER' | 'ADMIN';

/**
 * Origin the API expects a given surface's requests to come from. The API
 * derives the trusted surface from this header (see
 * apps/api/src/auth/auth-surface.ts), so any direct `APIRequestContext` call
 * that carries surface-scoped cookies must set it explicitly — real browser
 * navigations (customerPage/organiserPage/adminPage fixtures) already send it.
 */
export function originForSurface(surface: AuthSurface): string {
  return surface === 'ADMIN' ? urls.admin : urls.app;
}

export async function createApiContext(
  surface: AuthSurface = 'CUSTOMER'
): Promise<APIRequestContext> {
  return request.newContext({
    baseURL: `${urls.api}/v1/`,
    extraHTTPHeaders: {
      Accept: 'application/json',
      Origin: originForSurface(surface),
    },
  });
}

/**
 * Logs in via the surface-appropriate endpoint (`auth/login` for
 * CUSTOMER/ORGANIZER, `auth/admin/login` for ADMIN). Callers must create the
 * `api` context with the matching `surface` so the Origin header lines up
 * with the surface being authenticated (TTW-020).
 */
export async function apiLogin(
  api: APIRequestContext,
  email: string,
  password: string,
  surface: AuthSurface = 'CUSTOMER'
): Promise<void> {
  const path = surface === 'ADMIN' ? 'auth/admin/login' : 'auth/login';
  const res = await api.post(path, {
    data: { email, password },
  });
  if (!res.ok()) {
    throw new Error(`API login failed for ${email}: ${res.status()} ${await res.text()}`);
  }
}
