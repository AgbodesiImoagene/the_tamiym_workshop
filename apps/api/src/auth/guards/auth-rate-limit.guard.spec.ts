import { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { AUTH_RATE_LIMIT_BUCKET_KEY } from '../auth-rate-limit';
import { AuthRateLimitGuard } from './auth-rate-limit.guard';
import { AuthRateLimitService } from '../auth-rate-limit.service';

describe('AuthRateLimitGuard', () => {
  const rateLimit = { consume: jest.fn().mockResolvedValue(undefined) };
  const jwt = {
    decode: jest.fn().mockReturnValue({ sub: 'admin-1' }),
  };
  const reflector = {
    getAllAndOverride: jest.fn(),
  };

  let guard: AuthRateLimitGuard;

  beforeEach(() => {
    jest.clearAllMocks();
    guard = new AuthRateLimitGuard(
      reflector as unknown as Reflector,
      rateLimit as unknown as AuthRateLimitService,
      jwt as unknown as JwtService,
    );
  });

  function contextFor(body: Record<string, unknown>, path: string) {
    return {
      getHandler: () => ({}),
      getClass: () => ({}),
      switchToHttp: () => ({
        getRequest: () => ({
          body,
          path,
          ip: '127.0.0.1',
        }),
      }),
    } as unknown as ExecutionContext;
  }

  it('no-ops when no bucket metadata is present', async () => {
    reflector.getAllAndOverride.mockReturnValue(undefined);
    await expect(
      guard.canActivate(contextFor({}, '/v1/auth/login')),
    ).resolves.toBe(true);
    expect(rateLimit.consume).not.toHaveBeenCalled();
  });

  it('consumes identity+IP for email login', async () => {
    reflector.getAllAndOverride.mockReturnValue('customer_auth');
    await expect(
      guard.canActivate(
        contextFor({ email: 'Ada@Example.com' }, '/v1/auth/login'),
      ),
    ).resolves.toBe(true);
    expect(reflector.getAllAndOverride).toHaveBeenCalledWith(
      AUTH_RATE_LIMIT_BUCKET_KEY,
      expect.any(Array),
    );
    expect(rateLimit.consume).toHaveBeenCalledWith({
      bucket: 'customer_auth',
      email: 'Ada@Example.com',
      identity: null,
      ip: '127.0.0.1',
      surface: 'CUSTOMER',
    });
  });

  it('derives MFA identity from mfa_token sub', async () => {
    reflector.getAllAndOverride.mockReturnValue('admin_mfa');
    await expect(
      guard.canActivate(
        contextFor({ mfa_token: 'jwt.here' }, '/v1/auth/admin/mfa/challenge'),
      ),
    ).resolves.toBe(true);
    expect(rateLimit.consume).toHaveBeenCalledWith({
      bucket: 'admin_mfa',
      email: null,
      identity: 'user:admin-1',
      ip: '127.0.0.1',
      surface: 'ADMIN',
    });
  });
});
