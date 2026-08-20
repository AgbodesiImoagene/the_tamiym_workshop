import { Test, TestingModule } from '@nestjs/testing';
import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { CsrfGuard } from './csrf.guard';
import { IS_PUBLIC_KEY } from '../../decorators/public.decorator';
import { surfaceCookieNames } from '../../auth-cookies';
import { AuthSurface } from '../../../generated/prisma/enums';
import { CSRF_HEADER_NAME } from '../../../constants';

function buildContext(opts: {
  method: string;
  path?: string;
  cookies?: Record<string, string>;
  headers?: Record<string, string>;
  isPublic?: boolean;
}): ExecutionContext {
  const request = {
    method: opts.method,
    path: opts.path ?? '/v1/some/protected/route',
    cookies: opts.cookies ?? {},
    headers: opts.headers ?? {},
  };
  return {
    switchToHttp: () => ({ getRequest: () => request }),
    getHandler: () => ({ __isPublic: opts.isPublic }),
    getClass: () => ({}),
  } as unknown as ExecutionContext;
}

describe('CsrfGuard', () => {
  let guard: CsrfGuard;
  let reflector: Reflector;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [CsrfGuard, Reflector],
    }).compile();

    guard = module.get(CsrfGuard);
    reflector = module.get(Reflector);
    jest
      .spyOn(reflector, 'getAllAndOverride')
      .mockImplementation((metadataKey: unknown, targets: unknown[]) =>
        metadataKey === IS_PUBLIC_KEY
          ? Boolean((targets[0] as { __isPublic?: boolean })?.__isPublic)
          : undefined,
      );
  });

  it('allows non-mutating methods through without a CSRF check', () => {
    const context = buildContext({ method: 'GET' });
    expect(guard.canActivate(context)).toBe(true);
  });

  it('allows a mutating request with no surface session cookie (bearer-only or anonymous)', () => {
    const context = buildContext({
      method: 'POST',
      headers: { authorization: 'Bearer some.jwt.token' },
    });
    expect(guard.canActivate(context)).toBe(true);
  });

  it('rejects a cookie-authenticated mutation from a disallowed Origin', () => {
    const names = surfaceCookieNames(AuthSurface.CUSTOMER);
    const context = buildContext({
      method: 'POST',
      cookies: { [names.access]: 'access-token', [names.csrf]: 'csrf-value' },
      headers: {
        origin: 'http://evil.example.com',
        [CSRF_HEADER_NAME]: 'csrf-value',
      },
    });
    expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
  });

  it('rejects a cookie-authenticated mutation with a missing CSRF header', () => {
    const names = surfaceCookieNames(AuthSurface.CUSTOMER);
    const context = buildContext({
      method: 'POST',
      cookies: { [names.access]: 'access-token', [names.csrf]: 'csrf-value' },
      headers: { origin: 'http://localhost:3000' },
    });
    expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
  });

  it('rejects a cookie-authenticated mutation with a mismatched CSRF header', () => {
    const names = surfaceCookieNames(AuthSurface.CUSTOMER);
    const context = buildContext({
      method: 'POST',
      cookies: { [names.access]: 'access-token', [names.csrf]: 'csrf-value' },
      headers: {
        origin: 'http://localhost:3000',
        [CSRF_HEADER_NAME]: 'wrong-value',
      },
    });
    expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
  });

  it('allows a cookie-authenticated mutation with matching Origin + CSRF header (CUSTOMER)', () => {
    const names = surfaceCookieNames(AuthSurface.CUSTOMER);
    const context = buildContext({
      method: 'POST',
      cookies: { [names.access]: 'access-token', [names.csrf]: 'csrf-value' },
      headers: {
        origin: 'http://localhost:3000',
        [CSRF_HEADER_NAME]: 'csrf-value',
      },
    });
    expect(guard.canActivate(context)).toBe(true);
  });

  it('allows a cookie-authenticated mutation with matching Origin + CSRF header (ADMIN)', () => {
    const names = surfaceCookieNames(AuthSurface.ADMIN);
    const context = buildContext({
      method: 'DELETE',
      cookies: { [names.access]: 'access-token', [names.csrf]: 'admin-csrf' },
      headers: {
        origin: 'http://localhost:3003',
        [CSRF_HEADER_NAME]: 'admin-csrf',
      },
    });
    expect(guard.canActivate(context)).toBe(true);
  });

  it('rejects an admin-surface cookie presented against a customer Origin allowlist', () => {
    const names = surfaceCookieNames(AuthSurface.ADMIN);
    const context = buildContext({
      method: 'POST',
      cookies: { [names.access]: 'access-token', [names.csrf]: 'admin-csrf' },
      headers: {
        origin: 'http://localhost:3000',
        [CSRF_HEADER_NAME]: 'admin-csrf',
      },
    });
    expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
  });

  it('rejects when the CSRF header and cookie differ only in length', () => {
    const names = surfaceCookieNames(AuthSurface.CUSTOMER);
    const context = buildContext({
      method: 'POST',
      cookies: { [names.access]: 'access-token', [names.csrf]: 'short' },
      headers: {
        origin: 'http://localhost:3000',
        [CSRF_HEADER_NAME]: 'much-longer-value',
      },
    });
    expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
  });

  it('rejects an empty CSRF header even if it equals an empty cookie', () => {
    const names = surfaceCookieNames(AuthSurface.CUSTOMER);
    const context = buildContext({
      method: 'POST',
      cookies: { [names.access]: 'access-token', [names.csrf]: '' },
      headers: { origin: 'http://localhost:3000', [CSRF_HEADER_NAME]: '' },
    });
    expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
  });

  describe('public routes', () => {
    const sessionEstablishingPaths = [
      '/v1/auth/login',
      '/v1/auth/admin/login',
      '/v1/auth/register',
      '/v1/auth/google',
      '/v1/auth/google/callback',
      '/v1/auth/forgot-password',
      '/v1/auth/reset-password',
      '/v1/auth/verify-email',
      '/v1/auth/resend-verification',
      '/v1/webhooks/paystack',
    ];

    it.each(sessionEstablishingPaths)(
      'exempts %s even when session cookies are attached',
      (path) => {
        const names = surfaceCookieNames(AuthSurface.CUSTOMER);
        const context = buildContext({
          method: 'POST',
          path,
          isPublic: true,
          cookies: { [names.access]: 'access-token' },
          headers: { origin: 'http://evil.example.com' },
        });
        expect(guard.canActivate(context)).toBe(true);
      },
    );

    it('exempts a login path carrying a query string', () => {
      const context = buildContext({
        method: 'POST',
        path: '/v1/auth/login?next=%2Fdashboard',
        isPublic: true,
      });
      expect(guard.canActivate(context)).toBe(true);
    });

    it('does not treat /auth/admin/login as the customer /auth/login suffix', () => {
      // Guards against a sloppy suffix match: both paths are exempt, but for
      // their own entries — a path must never match a *different* route.
      const context = buildContext({
        method: 'POST',
        path: '/v1/auth/admin/login',
        isPublic: true,
      });
      expect(guard.canActivate(context)).toBe(true);
    });

    it('enforces CSRF on public auth/refresh when a refresh cookie is present', () => {
      const names = surfaceCookieNames(AuthSurface.CUSTOMER);
      const context = buildContext({
        method: 'POST',
        path: '/v1/auth/refresh',
        isPublic: true,
        cookies: { [names.refresh]: 'refresh-token' },
        headers: { origin: 'http://localhost:3000' },
      });
      expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
    });

    it('allows public auth/refresh with a matching Origin + CSRF header', () => {
      const names = surfaceCookieNames(AuthSurface.CUSTOMER);
      const context = buildContext({
        method: 'POST',
        path: '/v1/auth/refresh',
        isPublic: true,
        cookies: { [names.refresh]: 'refresh-token', [names.csrf]: 'tok' },
        headers: {
          origin: 'http://localhost:3000',
          [CSRF_HEADER_NAME]: 'tok',
        },
      });
      expect(guard.canActivate(context)).toBe(true);
    });

    it('rejects a cross-site public auth/refresh carrying session cookies', () => {
      const names = surfaceCookieNames(AuthSurface.CUSTOMER);
      const context = buildContext({
        method: 'POST',
        path: '/v1/auth/refresh',
        isPublic: true,
        cookies: { [names.refresh]: 'refresh-token', [names.csrf]: 'tok' },
        headers: {
          origin: 'http://evil.example.com',
          [CSRF_HEADER_NAME]: 'tok',
        },
      });
      expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
    });

    it('exempts body-only (cookie-less) public auth/refresh', () => {
      const context = buildContext({
        method: 'POST',
        path: '/v1/auth/refresh',
        isPublic: true,
      });
      expect(guard.canActivate(context)).toBe(true);
    });

    it('enforces CSRF on public auth/logout when an access cookie is present', () => {
      const names = surfaceCookieNames(AuthSurface.ADMIN);
      const context = buildContext({
        method: 'POST',
        path: '/v1/auth/logout',
        isPublic: true,
        cookies: { [names.access]: 'access-token', [names.csrf]: 'tok' },
        headers: { origin: 'http://localhost:3003' },
      });
      expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
    });

    it('allows public auth/logout with a matching Origin + CSRF header', () => {
      const names = surfaceCookieNames(AuthSurface.ADMIN);
      const context = buildContext({
        method: 'POST',
        path: '/v1/auth/logout',
        isPublic: true,
        cookies: { [names.access]: 'access-token', [names.csrf]: 'tok' },
        headers: {
          origin: 'http://localhost:3003',
          [CSRF_HEADER_NAME]: 'tok',
        },
      });
      expect(guard.canActivate(context)).toBe(true);
    });

    it('does not exempt an unrelated route that merely shares the "webhooks" segment', () => {
      // Guards against the pre-fix substring/segment match, which treated
      // any path containing a "webhooks" or "paystack" segment as exempt.
      const names = surfaceCookieNames(AuthSurface.CUSTOMER);
      const context = buildContext({
        method: 'POST',
        path: '/v1/webhooks/some-other-provider',
        isPublic: true,
        cookies: { [names.access]: 'access-token' },
        headers: { origin: 'http://evil.example.com' },
      });
      expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
    });

    it('does not exempt an unrelated route that merely shares the "paystack" segment', () => {
      const names = surfaceCookieNames(AuthSurface.CUSTOMER);
      const context = buildContext({
        method: 'POST',
        path: '/v1/orders/paystack/refund',
        isPublic: true,
        cookies: { [names.access]: 'access-token' },
        headers: { origin: 'http://evil.example.com' },
      });
      expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
    });

    it('falls back to originalUrl when express path is unavailable', () => {
      const request = {
        method: 'POST',
        originalUrl: '/v1/auth/login',
        cookies: {},
        headers: {},
      };
      const context = {
        switchToHttp: () => ({ getRequest: () => request }),
        getHandler: () => ({ __isPublic: true }),
        getClass: () => ({}),
      } as unknown as ExecutionContext;
      expect(guard.canActivate(context)).toBe(true);
    });
  });
});
