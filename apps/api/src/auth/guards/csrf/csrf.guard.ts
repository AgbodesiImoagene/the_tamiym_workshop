import {
  ForbiddenException,
  Injectable,
  CanActivate,
  ExecutionContext,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import * as crypto from 'node:crypto';
import type { Request } from 'express';
import { IS_PUBLIC_KEY } from '../../decorators/public.decorator';
import { AuthSurface } from '../../../generated/prisma/enums';
import {
  adminOrigins,
  customerOrigins,
  requestOrigin,
  resolveSurfaceFromOrigin,
} from '../../auth-surface';
import {
  surfaceCookieNames,
  surfacesWithSessionCookies,
} from '../../auth-cookies';
import { CSRF_HEADER_NAME } from '../../../constants';

const MUTATING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

/**
 * Public paths that are exempt from CSRF because they either establish a
 * session from credentials the browser cannot supply ambiently (login,
 * register, token-bearing email flows) or are provider callbacks that
 * authenticate by signature/state instead of a cookie.
 *
 * Matched as path suffixes so the global `/v1` prefix (and any future
 * versioned prefix) does not need to be repeated here.
 */
const CSRF_EXEMPT_PUBLIC_PATHS = [
  'auth/login',
  'auth/admin/login',
  'auth/register',
  'auth/google',
  'auth/google/callback',
  'auth/forgot-password',
  'auth/reset-password',
  'auth/verify-email',
  'auth/resend-verification',
  // Paystack webhook (see WebhooksController) — signature-authenticated,
  // never cookies. Exact path only: this must never broaden to match on a
  // "webhooks" or "paystack" path *segment*, which would exempt unrelated
  // routes that merely happen to share a segment name.
  'webhooks/paystack',
];

/**
 * TTW-020 CSRF defense for cookie-authenticated mutations.
 *
 * Policy (see docs/14-auth-and-session-architecture.md):
 * - Non-mutating methods are exempt.
 * - Session-establishing public auth paths and webhook paths are exempt.
 * - Every other request — including the remaining `@Public()` routes
 *   `auth/refresh` and `auth/logout` — is checked whenever it presents a
 *   surface **access or refresh** cookie. Those two routes act on an ambient
 *   cookie, so skipping CSRF for them would leave forced-logout and
 *   session-rotation CSRF open.
 * - Requests carrying NO surface session cookie (bearer-only, body-only
 *   refresh, or anonymous) are exempt — an explicit token cannot be forged by
 *   a browser via cross-site form/fetch the way an ambient cookie can.
 * - Otherwise: the Origin (fallback Referer) must resolve to the surface whose
 *   cookie is presented, and the `X-CSRF-Token` header must match that
 *   surface's CSRF cookie (timing-safe compare, double-submit pattern).
 */
@Injectable()
export class CsrfGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    if (!MUTATING_METHODS.has(request.method.toUpperCase())) return true;

    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic && this.isCsrfExemptPath(request)) return true;

    const presentedSurfaces = surfacesWithSessionCookies(request);
    if (presentedSurfaces.length === 0) return true;

    const surface = resolveSurfaceFromOrigin(request);
    if (!surface || !presentedSurfaces.includes(surface)) {
      throw new ForbiddenException(
        'Request Origin is not allowed for this session',
      );
    }

    // Redundant given `resolveSurfaceFromOrigin`, but keeps the allowlist the
    // explicit gate even if surface resolution gains other inputs later.
    const allowlist =
      surface === AuthSurface.ADMIN ? adminOrigins() : customerOrigins();
    const origin = requestOrigin(request);
    if (!origin || !allowlist.includes(origin)) {
      throw new ForbiddenException(
        'Request Origin is not allowed for this session',
      );
    }

    const csrfCookieName = surfaceCookieNames(surface).csrf;
    const csrfCookie = request.cookies?.[csrfCookieName] as string | undefined;
    const csrfHeader = request.headers[CSRF_HEADER_NAME] as string | undefined;
    if (!this.csrfTokensMatch(csrfHeader, csrfCookie)) {
      throw new ForbiddenException('Missing or invalid CSRF token');
    }

    return true;
  }

  /** Whether this request's path is on the CSRF exemption list. */
  private isCsrfExemptPath(request: Request): boolean {
    const path = this.normalizedPath(request);
    if (!path) return false;
    return CSRF_EXEMPT_PUBLIC_PATHS.some((exempt) =>
      path.endsWith(`/${exempt}`),
    );
  }

  /** Request path without query string, always leading-slashed. */
  private normalizedPath(request: Request): string {
    const raw = request.path || request.originalUrl || request.url || '';
    const withoutQuery = raw.split('?')[0] ?? '';
    if (!withoutQuery) return '';
    return withoutQuery.startsWith('/') ? withoutQuery : `/${withoutQuery}`;
  }

  private csrfTokensMatch(
    header: string | undefined,
    cookie: string | undefined,
  ): boolean {
    if (!header || !cookie) return false;
    const headerBuf = Buffer.from(header, 'utf8');
    const cookieBuf = Buffer.from(cookie, 'utf8');
    if (headerBuf.length === 0 || headerBuf.length !== cookieBuf.length) {
      return false;
    }
    return crypto.timingSafeEqual(headerBuf, cookieBuf);
  }
}
