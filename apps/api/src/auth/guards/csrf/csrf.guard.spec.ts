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
  cookies?: Record<string, string>;
  headers?: Record<string, string>;
  isPublic?: boolean;
}): ExecutionContext {
  const request = {
    method: opts.method,
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

  it('allows public routes through regardless of method', () => {
    const context = buildContext({ method: 'POST', isPublic: true });
    expect(guard.canActivate(context)).toBe(true);
  });

  it('allows non-mutating methods through without a CSRF check', () => {
    const context = buildContext({ method: 'GET' });
    expect(guard.canActivate(context)).toBe(true);
  });

  it('allows a mutating request with no surface access cookie (bearer-only or anonymous)', () => {
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
});
