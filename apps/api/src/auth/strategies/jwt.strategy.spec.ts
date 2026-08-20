import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { UnauthorizedException } from '@nestjs/common';
import { JwtStrategy } from './jwt.strategy';
import { PrismaService } from '../../prisma/prisma.service';
import { UserRole, UserStatus } from '../../generated/prisma/client';
import { AuthSurface } from '../../generated/prisma/enums';
import { surfaceCookieNames } from '../auth-cookies';

const mockDbUser = {
  id: 'user-1',
  email: 'user@example.com',
  role: UserRole.CUSTOMER,
  status: UserStatus.ACTIVE,
  firstName: 'Test',
  lastName: 'User',
  phone: null,
};

describe('JwtStrategy', () => {
  let strategy: JwtStrategy;
  let prisma: { user: { findUnique: jest.Mock } };

  beforeEach(async () => {
    prisma = { user: { findUnique: jest.fn() } };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        JwtStrategy,
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn().mockReturnValue('a-real-non-placeholder-secret'),
          },
        },
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    strategy = module.get(JwtStrategy);
  });

  function buildRequest(opts: {
    origin?: string;
    authorization?: string;
  }): any {
    return {
      headers: {
        ...(opts.origin ? { origin: opts.origin } : {}),
        ...(opts.authorization ? { authorization: opts.authorization } : {}),
      },
    };
  }

  it('attaches the payload surface to the returned user', async () => {
    prisma.user.findUnique.mockResolvedValue(mockDbUser);
    const req = buildRequest({ origin: 'http://localhost:3000' });

    const result = await strategy.validate(req, {
      sub: 'user-1',
      email: 'user@example.com',
      role: UserRole.CUSTOMER,
      surface: AuthSurface.CUSTOMER,
    });

    expect(result).toEqual({ ...mockDbUser, surface: AuthSurface.CUSTOMER });
  });

  it('throws when the user no longer exists', async () => {
    prisma.user.findUnique.mockResolvedValue(null);
    const req = buildRequest({ origin: 'http://localhost:3000' });

    await expect(
      strategy.validate(req, {
        sub: 'missing',
        email: 'missing@example.com',
        role: UserRole.CUSTOMER,
        surface: AuthSurface.CUSTOMER,
      }),
    ).rejects.toThrow(UnauthorizedException);
  });

  it('throws when the user is soft-deleted', async () => {
    prisma.user.findUnique.mockResolvedValue({
      ...mockDbUser,
      status: UserStatus.DELETED,
    });
    const req = buildRequest({ origin: 'http://localhost:3000' });

    await expect(
      strategy.validate(req, {
        sub: 'user-1',
        email: 'user@example.com',
        role: UserRole.CUSTOMER,
        surface: AuthSurface.CUSTOMER,
      }),
    ).rejects.toThrow(UnauthorizedException);
  });

  it('rejects a CUSTOMER-surface JWT presented on the admin Origin (cookie auth)', async () => {
    prisma.user.findUnique.mockResolvedValue(mockDbUser);
    const req = buildRequest({ origin: 'http://localhost:3003' });

    await expect(
      strategy.validate(req, {
        sub: 'user-1',
        email: 'user@example.com',
        role: UserRole.CUSTOMER,
        surface: AuthSurface.CUSTOMER,
      }),
    ).rejects.toThrow(UnauthorizedException);
  });

  it('rejects a cookie-authenticated request with no resolvable Origin', async () => {
    prisma.user.findUnique.mockResolvedValue(mockDbUser);
    const req = buildRequest({});

    await expect(
      strategy.validate(req, {
        sub: 'user-1',
        email: 'user@example.com',
        role: UserRole.CUSTOMER,
        surface: AuthSurface.CUSTOMER,
      }),
    ).rejects.toThrow(UnauthorizedException);
  });

  it('allows a bearer-authenticated request even when the surface would otherwise mismatch', async () => {
    prisma.user.findUnique.mockResolvedValue(mockDbUser);
    // Bearer requests are surface-agnostic: no Origin header at all, plus an
    // explicit Authorization header, must still succeed.
    const req = buildRequest({ authorization: 'Bearer some.jwt.token' });

    const result = await strategy.validate(req, {
      sub: 'user-1',
      email: 'user@example.com',
      role: UserRole.CUSTOMER,
      surface: AuthSurface.ADMIN,
    });

    expect(result.surface).toBe(AuthSurface.ADMIN);
  });

  describe('cookie extraction (surface-scoped)', () => {
    function extractFromStrategy(req: any): string | null {
      // The private extractor closure is not exported; exercise it via the
      // configured passport-jwt `jwtFromRequest` option on the strategy.
      const options = (strategy as any)._jwtFromRequest as (
        req: any,
      ) => string | null;
      return options(req);
    }

    it('extracts the CUSTOMER access cookie for a customer-origin request', () => {
      const names = surfaceCookieNames(AuthSurface.CUSTOMER);
      const req = {
        headers: { origin: 'http://localhost:3000' },
        cookies: { [names.access]: 'customer-jwt' },
      };
      expect(extractFromStrategy(req)).toBe('customer-jwt');
    });

    it('does not extract the ADMIN access cookie for a customer-origin request', () => {
      const adminNames = surfaceCookieNames(AuthSurface.ADMIN);
      const req = {
        headers: { origin: 'http://localhost:3000' },
        cookies: { [adminNames.access]: 'admin-jwt' },
      };
      expect(extractFromStrategy(req)).toBeNull();
    });

    it('prefers the Authorization Bearer token over any cookie', () => {
      const names = surfaceCookieNames(AuthSurface.CUSTOMER);
      const req = {
        headers: {
          origin: 'http://localhost:3000',
          authorization: 'Bearer bearer-jwt',
        },
        cookies: { [names.access]: 'customer-jwt' },
      };
      expect(extractFromStrategy(req)).toBe('bearer-jwt');
    });
  });
});
