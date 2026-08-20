import { request, type APIRequestContext } from '@playwright/test';
import { E2E_ADMIN_TOTP_SECRET, urls } from './identities';
import { generateTotpCode } from './totp';

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

type LoginBody = {
  csrf_token?: string;
  mfa?: { status?: string };
  mfa_token?: string;
  secret?: string;
};

/**
 * Logs in via the surface-appropriate endpoint (`auth/login` for
 * CUSTOMER/ORGANIZER, `auth/admin/login` for ADMIN). Callers must create the
 * `api` context with the matching `surface` so the Origin header lines up
 * with the surface being authenticated (TTW-020).
 *
 * ADMIN completes MFA enrollment or challenge before returning (TTW-023).
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
  surface: AuthSurface = 'CUSTOMER',
  totpSecret: string = E2E_ADMIN_TOTP_SECRET
): Promise<{ csrfToken: string }> {
  const path = surface === 'ADMIN' ? 'auth/admin/login' : 'auth/login';
  const res = await api.post(path, {
    data: { email, password },
  });
  if (!res.ok()) {
    throw new Error(`API login failed for ${email}: ${res.status()} ${await res.text()}`);
  }
  const body = (await res.json()) as LoginBody;
  if (body.csrf_token) {
    return { csrfToken: body.csrf_token };
  }

  if (surface !== 'ADMIN' || !body.mfa_token || !body.mfa?.status) {
    throw new Error(`API login for ${email} returned no csrf_token`);
  }

  if (body.mfa.status === 'ENROLLMENT_REQUIRED') {
    const enrollRes = await api.post('auth/admin/mfa/enroll/start', {
      data: { mfa_token: body.mfa_token },
    });
    if (!enrollRes.ok()) {
      throw new Error(
        `Admin MFA enroll start failed for ${email}: ${enrollRes.status()} ${await enrollRes.text()}`
      );
    }
    const enrollBody = (await enrollRes.json()) as { secret?: string };
    if (!enrollBody.secret) {
      throw new Error(`Admin MFA enroll start for ${email} returned no secret`);
    }
    const confirmRes = await api.post('auth/admin/mfa/enroll/confirm', {
      data: {
        mfa_token: body.mfa_token,
        totp: generateTotpCode(enrollBody.secret),
      },
    });
    if (!confirmRes.ok()) {
      throw new Error(
        `Admin MFA enroll confirm failed for ${email}: ${confirmRes.status()} ${await confirmRes.text()}`
      );
    }
    const confirmBody = (await confirmRes.json()) as { csrf_token?: string };
    if (!confirmBody.csrf_token) {
      throw new Error(`Admin MFA enroll confirm for ${email} returned no csrf_token`);
    }
    return { csrfToken: confirmBody.csrf_token };
  }

  if (body.mfa.status === 'CHALLENGE_REQUIRED') {
    const challengeRes = await api.post('auth/admin/mfa/challenge', {
      data: {
        mfa_token: body.mfa_token,
        totp: generateTotpCode(totpSecret),
      },
    });
    if (!challengeRes.ok()) {
      throw new Error(
        `Admin MFA challenge failed for ${email}: ${challengeRes.status()} ${await challengeRes.text()}`
      );
    }
    const challengeBody = (await challengeRes.json()) as { csrf_token?: string };
    if (!challengeBody.csrf_token) {
      throw new Error(`Admin MFA challenge for ${email} returned no csrf_token`);
    }
    return { csrfToken: challengeBody.csrf_token };
  }

  throw new Error(`API login for ${email} returned unexpected MFA status: ${body.mfa.status}`);
}
