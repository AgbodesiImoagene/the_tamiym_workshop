/**
 * TTW-020 auth surface resolution.
 *
 * The requested auth surface (CUSTOMER vs ADMIN) is always a server-derived
 * property — never trust a client-supplied body field. See
 * docs/14-auth-and-session-architecture.md and
 * docs/decisions/ttw-020-auth-surface-isolation.md.
 */
import type { Request } from 'express';
import { AuthSurface } from '../generated/prisma/enums';
import { UserRole } from '../generated/prisma/client';

const DEFAULT_ADMIN_ORIGINS = ['http://localhost:3003'];
const DEFAULT_CUSTOMER_ORIGINS = [
  'http://localhost:3000',
  'http://localhost:3002',
];

function parseOriginList(value: string | undefined): string[] {
  if (!value?.trim()) return [];
  return value
    .split(',')
    .map((entry) => normalizeOrigin(entry.trim()))
    .filter((entry): entry is string => Boolean(entry));
}

function normalizeOrigin(value: string): string | null {
  if (!value) return null;
  try {
    return new URL(value).origin;
  } catch {
    return null;
  }
}

/** Allowlisted ADMIN surface origins (env `AUTH_ADMIN_ORIGINS`, comma-separated). */
export function adminOrigins(): string[] {
  const fromEnv = parseOriginList(process.env.AUTH_ADMIN_ORIGINS);
  return fromEnv.length > 0 ? fromEnv : DEFAULT_ADMIN_ORIGINS;
}

/** Allowlisted CUSTOMER surface origins (env `AUTH_CUSTOMER_ORIGINS`, comma-separated). */
export function customerOrigins(): string[] {
  const fromEnv = parseOriginList(process.env.AUTH_CUSTOMER_ORIGINS);
  return fromEnv.length > 0 ? fromEnv : DEFAULT_CUSTOMER_ORIGINS;
}

/** Extract and normalize the request's Origin header, falling back to Referer. */
export function requestOrigin(req: Pick<Request, 'headers'>): string | null {
  const origin = req.headers?.origin;
  if (typeof origin === 'string' && origin.trim()) {
    return normalizeOrigin(origin.trim());
  }
  const referer = req.headers?.referer;
  if (typeof referer === 'string' && referer.trim()) {
    return normalizeOrigin(referer.trim());
  }
  return null;
}

/**
 * Resolve the auth surface for an authenticated request from its Origin
 * (fallback Referer) against the surface allowlists. Returns `undefined`
 * when the origin is missing or matches neither allowlist — callers must
 * decide how to treat an unresolved surface (e.g. reject a cookie-scoped
 * mutation, or allow a bearer-only request through).
 */
export function resolveSurfaceFromOrigin(
  req: Pick<Request, 'headers'>,
): AuthSurface | undefined {
  const origin = requestOrigin(req);
  if (!origin) return undefined;
  if (adminOrigins().includes(origin)) return AuthSurface.ADMIN;
  if (customerOrigins().includes(origin)) return AuthSurface.CUSTOMER;
  return undefined;
}

/**
 * Resolve the surface implied by a login/register route path. This is a
 * trusted, server-derived value — the route itself, never a client body
 * field. `/auth/admin/login` (and any future `/auth/admin/*` login route) is
 * ADMIN; every other auth login/register route is CUSTOMER.
 */
export function resolveLoginSurfaceFromPath(path: string): AuthSurface {
  const normalizedPath = (path.split('?')[0] ?? path).toLowerCase();
  return /\/auth\/admin(\/|$)/.test(normalizedPath)
    ? AuthSurface.ADMIN
    : AuthSurface.CUSTOMER;
}

/** Roles permitted to authenticate on a given surface (TTW-020 invariant). */
export function allowedRolesForSurface(surface: AuthSurface): UserRole[] {
  return surface === AuthSurface.ADMIN
    ? [UserRole.ADMIN]
    : [UserRole.CUSTOMER, UserRole.ORGANIZER];
}

/** Whether `role` may authenticate on `surface` (role × surface invariant). */
export function isRoleAllowedForSurface(
  role: UserRole,
  surface: AuthSurface,
): boolean {
  return allowedRolesForSurface(surface).includes(role);
}
