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
} from '../../auth-surface';
import { surfaceCookieNames } from '../../auth-cookies';
import { CSRF_HEADER_NAME } from '../../../constants';

const MUTATING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

/**
 * TTW-020 CSRF defense for cookie-authenticated mutations.
 *
 * Policy (see docs/14-auth-and-session-architecture.md):
 * - Public routes (session-establishing auth endpoints, webhooks) are exempt.
 * - Non-mutating methods are exempt.
 * - Requests carrying NO surface access cookie (bearer-only, or unauthenticated)
 *   are exempt — an explicit bearer token cannot be forged by a browser via
 *   cross-site form/fetch the way an ambient cookie can.
 * - Otherwise: the Origin (fallback Referer) must be in that surface's
 *   allowlist, and the `X-CSRF-Token` header must match the surface's CSRF
 *   cookie (timing-safe compare, double-submit pattern).
 */
@Injectable()
export class CsrfGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const request = context.switchToHttp().getRequest<Request>();
    if (!MUTATING_METHODS.has(request.method.toUpperCase())) return true;

    const presented = this.presentedSurfaceCookie(request);
    if (!presented) return true;

    const { surface } = presented;
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

  /** The surface (if any) whose access cookie is present on this request. */
  private presentedSurfaceCookie(
    request: Request,
  ): { surface: AuthSurface } | null {
    for (const surface of [AuthSurface.CUSTOMER, AuthSurface.ADMIN]) {
      const accessCookieName = surfaceCookieNames(surface).access;
      const value = request.cookies?.[accessCookieName] as string | undefined;
      if (value) return { surface };
    }
    return null;
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
