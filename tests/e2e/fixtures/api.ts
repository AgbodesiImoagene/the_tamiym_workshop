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

/** `sessionStorage` key the frontends keep the surface CSRF token under. */
export function csrfStorageKey(surface: AuthSurface): string {
  return surface === 'ADMIN' ? 'ttw_admin_csrf' : 'ttw_customer_csrf';
}

/**
 * Logs in via the surface-appropriate endpoint (`auth/login` for
 * CUSTOMER/ORGANIZER, `auth/admin/login` for ADMIN). Callers must create the
 * `api` context with the matching `surface` so the Origin header lines up
 * with the surface being authenticated (TTW-020).
 *
 * Returns the `csrf_token` from the response body — the same value the API set
 * as the surface CSRF cookie. Frontends must use this body copy because the
 * cookie is host-only on the API origin (see
 * docs/14-auth-and-session-architecture.md).
 */
export async function apiLogin(
  api: APIRequestContext,
  email: string,
  password: string,
  surface: AuthSurface = 'CUSTOMER'
): Promise<{ csrfToken: string }> {
  const path = surface === 'ADMIN' ? 'auth/admin/login' : 'auth/login';
  const res = await api.post(path, {
    data: { email, password },
  });
  if (!res.ok()) {
    throw new Error(`API login failed for ${email}: ${res.status()} ${await res.text()}`);
  }
  const body = (await res.json()) as { csrf_token?: string };
  if (!body.csrf_token) {
    throw new Error(`API login for ${email} returned no csrf_token`);
  }
  return { csrfToken: body.csrf_token };
}
