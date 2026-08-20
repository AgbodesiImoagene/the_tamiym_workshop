import type { Response } from 'express';
import * as crypto from 'node:crypto';
import { AuthSurface } from '../generated/prisma/enums';
import {
  ACCESS_TOKEN_COOKIE_NAME,
  ACCESS_TOKEN_COOKIE_MAX_AGE_MS,
  REFRESH_TOKEN_COOKIE_NAME,
  REFRESH_TOKEN_COOKIE_MAX_AGE_MS,
  CUSTOMER_ACCESS_COOKIE_NAME,
  CUSTOMER_REFRESH_COOKIE_NAME,
  CUSTOMER_CSRF_COOKIE_NAME,
  ADMIN_ACCESS_COOKIE_NAME,
  ADMIN_REFRESH_COOKIE_NAME,
  ADMIN_CSRF_COOKIE_NAME,
} from '../constants';

export interface AuthCookieBaseOptions {
  httpOnly: boolean;
  secure: boolean;
  sameSite: 'none' | 'lax';
  path: string;
}

/** Host-only cookie (no `Domain` attribute) — see docs/14-auth-and-session-architecture.md. */
export function authCookieBaseOptions(): AuthCookieBaseOptions {
  const isProduction = process.env.NODE_ENV === 'production';
  return {
    httpOnly: true,
    secure: isProduction,
    sameSite: isProduction ? 'none' : 'lax',
    path: '/',
  };
}

interface SurfaceCookieNames {
  access: string;
  refresh: string;
  /** Readable (non-httpOnly) double-submit CSRF cookie for this surface. */
  csrf: string;
}

const SURFACE_COOKIE_NAMES: Record<AuthSurface, SurfaceCookieNames> = {
  [AuthSurface.CUSTOMER]: {
    access: CUSTOMER_ACCESS_COOKIE_NAME,
    refresh: CUSTOMER_REFRESH_COOKIE_NAME,
    csrf: CUSTOMER_CSRF_COOKIE_NAME,
  },
  [AuthSurface.ADMIN]: {
    access: ADMIN_ACCESS_COOKIE_NAME,
    refresh: ADMIN_REFRESH_COOKIE_NAME,
    csrf: ADMIN_CSRF_COOKIE_NAME,
  },
};

/** Cookie names (access/refresh/csrf) scoped to a given auth surface. */
export function surfaceCookieNames(surface: AuthSurface): SurfaceCookieNames {
  return SURFACE_COOKIE_NAMES[surface];
}

function oppositeSurface(surface: AuthSurface): AuthSurface {
  return surface === AuthSurface.ADMIN
    ? AuthSurface.CUSTOMER
    : AuthSurface.ADMIN;
}

/**
 * Set the access/refresh/CSRF cookies for `surface`. Always also clears the
 * legacy shared cookie names and the *opposite* surface's cookies, so a
 * browser can never simultaneously present two surfaces' credentials.
 */
export function setSurfaceAuthCookies(
  res: Response,
  surface: AuthSurface,
  accessToken: string,
  refreshToken: string,
): void {
  const names = surfaceCookieNames(surface);
  const base = authCookieBaseOptions();

  res.cookie(names.access, accessToken, {
    ...base,
    maxAge: ACCESS_TOKEN_COOKIE_MAX_AGE_MS,
  });
  res.cookie(names.refresh, refreshToken, {
    ...base,
    maxAge: REFRESH_TOKEN_COOKIE_MAX_AGE_MS,
  });

  const csrfToken = crypto.randomBytes(32).toString('hex');
  res.cookie(names.csrf, csrfToken, {
    ...base,
    httpOnly: false,
    maxAge: REFRESH_TOKEN_COOKIE_MAX_AGE_MS,
  });

  clearSurfaceAuthCookies(res, oppositeSurface(surface));
  clearLegacyAuthCookies(res);
}

/** Clear the access/refresh/CSRF cookies for `surface`. */
export function clearSurfaceAuthCookies(
  res: Response,
  surface: AuthSurface,
): void {
  const names = surfaceCookieNames(surface);
  const base = { ...authCookieBaseOptions(), maxAge: 0 };
  res.cookie(names.access, '', base);
  res.cookie(names.refresh, '', base);
  res.cookie(names.csrf, '', { ...base, httpOnly: false });
}

/** Clear both surfaces' cookies and the legacy shared cookie names. */
export function clearAllAuthCookies(res: Response): void {
  clearSurfaceAuthCookies(res, AuthSurface.CUSTOMER);
  clearSurfaceAuthCookies(res, AuthSurface.ADMIN);
  clearLegacyAuthCookies(res);
}

/**
 * Clear the legacy pre-TTW-020 shared cookie names. Never set these names —
 * this exists only so browsers holding pre-cutover cookies get them cleared.
 */
export function clearLegacyAuthCookies(res: Response): void {
  const base = { ...authCookieBaseOptions(), maxAge: 0 };
  res.cookie(ACCESS_TOKEN_COOKIE_NAME, '', base);
  res.cookie(REFRESH_TOKEN_COOKIE_NAME, '', base);
}
