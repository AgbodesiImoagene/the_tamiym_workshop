import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { UnauthorizedException } from '@nestjs/common';
import { JwtStrategy } from './jwt.strategy';
import { PrismaService } from '../../prisma/prisma.service';
import { UserRole, UserStatus } from '../../generated/prisma/client';
import { AuthSurface } from '../../generated/prisma/enums';
import { surfaceCookieNames } from '../auth-cookies';
import { AccountPolicyService } from '../account-policy.service';
import { AuthSessionService } from '../auth-session.service';
import { AdminMfaService } from '../admin-mfa.service';

const mockDbUser = {
  id: 'user-1',
  email: 'user@example.com',
  role: UserRole.CUSTOMER,
  status: UserStatus.ACTIVE,
  firstName: 'Test',
  lastName: 'User',
  phone: null,
  emailVerifiedAt: new Date(),
};

const SID = 'sess-1';

describe('JwtStrategy', () => {
  let strategy: JwtStrategy;
  let prisma: { user: { findUnique: jest.Mock } };
  let authSession: { assertAccessSession: jest.Mock };
  let adminMfa: { isEnabled: jest.Mock };

  beforeEach(async () => {
    prisma = { user: { findUnique: jest.fn() } };
    authSession = {
      assertAccessSession: jest.fn().mockResolvedValue(undefined),
    };
    adminMfa = {
      isEnabled: jest.fn().mockResolvedValue(true),
    };

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
        { provide: AuthSessionService, useValue: authSession },
        { provide: AdminMfaService, useValue: adminMfa },
        AccountPolicyService,
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

  function payload(
    overrides: Partial<{
      sub: string;
      email: string;
      role: UserRole;
      surface: AuthSurface;
      sid: string;
    }> = {},
  ) {
    return {
      sub: 'user-1',
      email: 'user@example.com',
      role: UserRole.CUSTOMER,
      surface: AuthSurface.CUSTOMER,
      sid: SID,
      ...overrides,
    };
  }

  it('attaches the payload surface and sessionId to the returned user', async () => {
    prisma.user.findUnique.mockResolvedValue(mockDbUser);
    const req = buildRequest({ origin: 'http://localhost:3000' });

    const result = await strategy.validate(req, payload());

    expect(authSession.assertAccessSession).toHaveBeenCalledWith(
      SID,
      'user-1',
      AuthSurface.CUSTOMER,
    );
    expect(result).toEqual({
      id: mockDbUser.id,
      email: mockDbUser.email,
      role: mockDbUser.role,
      status: mockDbUser.status,
      firstName: mockDbUser.firstName,
      lastName: mockDbUser.lastName,
      phone: mockDbUser.phone,
      emailVerified: true,
      surface: AuthSurface.CUSTOMER,
      sessionId: SID,
    });
  });

  it('rejects a token with missing sid', async () => {
    prisma.user.findUnique.mockResolvedValue(mockDbUser);
    const req = buildRequest({ origin: 'http://localhost:3000' });

    await expect(strategy.validate(req, payload({ sid: '' }))).rejects.toThrow(
      UnauthorizedException,
    );
    expect(authSession.assertAccessSession).not.toHaveBeenCalled();
  });

  it('throws when the user no longer exists', async () => {
    prisma.user.findUnique.mockResolvedValue(null);
    const req = buildRequest({ origin: 'http://localhost:3000' });

    await expect(
      strategy.validate(req, payload({ sub: 'missing' })),
    ).rejects.toThrow(UnauthorizedException);
  });

  it('throws when the user is soft-deleted', async () => {
    prisma.user.findUnique.mockResolvedValue({
      ...mockDbUser,
      status: UserStatus.DELETED,
    });
    const req = buildRequest({ origin: 'http://localhost:3000' });

    await expect(strategy.validate(req, payload())).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it('rejects a CUSTOMER-surface JWT presented on the admin Origin (cookie auth)', async () => {
    prisma.user.findUnique.mockResolvedValue(mockDbUser);
    const req = buildRequest({ origin: 'http://localhost:3003' });

    await expect(strategy.validate(req, payload())).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it('rejects a cookie-authenticated request with no resolvable Origin', async () => {
    prisma.user.findUnique.mockResolvedValue(mockDbUser);
    const req = buildRequest({});

    await expect(strategy.validate(req, payload())).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it('allows a bearer-authenticated request with no resolvable Origin', async () => {
    prisma.user.findUnique.mockResolvedValue(mockDbUser);
    const req = buildRequest({ authorization: 'Bearer some.jwt.token' });

    const result = await strategy.validate(req, payload());

    expect(result.surface).toBe(AuthSurface.CUSTOMER);
    expect(result.sessionId).toBe(SID);
  });

  it('rejects a bearer token whose surface the account role may not use', async () => {
    prisma.user.findUnique.mockResolvedValue(mockDbUser);
    const req = buildRequest({ authorization: 'Bearer some.jwt.token' });

    await expect(
      strategy.validate(req, payload({ surface: AuthSurface.ADMIN })),
    ).rejects.toThrow(UnauthorizedException);
  });

  it('rejects an ORGANIZER on the ADMIN surface (bearer)', async () => {
    prisma.user.findUnique.mockResolvedValue({
      ...mockDbUser,
      role: UserRole.ORGANIZER,
    });
    const req = buildRequest({ authorization: 'Bearer some.jwt.token' });

    await expect(
      strategy.validate(req, payload({ surface: AuthSurface.ADMIN })),
    ).rejects.toThrow(UnauthorizedException);
  });

  it('rejects a session whose account was promoted to ADMIN after it was minted', async () => {
    prisma.user.findUnique.mockResolvedValue({
      ...mockDbUser,
      role: UserRole.ADMIN,
    });
    const req = buildRequest({ origin: 'http://localhost:3000' });

    await expect(strategy.validate(req, payload())).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it('rejects a token with no surface claim', async () => {
    prisma.user.findUnique.mockResolvedValue(mockDbUser);
    const req = buildRequest({ origin: 'http://localhost:3000' });

    await expect(
      strategy.validate(req, {
        sub: 'user-1',
        email: 'user@example.com',
        role: UserRole.CUSTOMER,
        sid: SID,
      } as any),
    ).rejects.toThrow(UnauthorizedException);
  });

  it('rejects a token with an unknown surface claim', async () => {
    prisma.user.findUnique.mockResolvedValue(mockDbUser);
    const req = buildRequest({ origin: 'http://localhost:3000' });

    await expect(
      strategy.validate(req, {
        ...payload(),
        surface: 'SUPERUSER',
      } as any),
    ).rejects.toThrow(UnauthorizedException);
  });

  it('accepts an ADMIN-role bearer token on the ADMIN surface', async () => {
    prisma.user.findUnique.mockResolvedValue({
      ...mockDbUser,
      role: UserRole.ADMIN,
    });
    const req = buildRequest({ authorization: 'Bearer some.jwt.token' });

    const result = await strategy.validate(
      req,
      payload({
        role: UserRole.ADMIN,
        surface: AuthSurface.ADMIN,
      }),
    );

    expect(result.surface).toBe(AuthSurface.ADMIN);
    expect(adminMfa.isEnabled).toHaveBeenCalledWith('user-1');
  });

  it('rejects ADMIN-surface JWT when MFA is not enabled', async () => {
    prisma.user.findUnique.mockResolvedValue({
      ...mockDbUser,
      role: UserRole.ADMIN,
    });
    adminMfa.isEnabled.mockResolvedValue(false);
    const req = buildRequest({ authorization: 'Bearer some.jwt.token' });

    await expect(
      strategy.validate(
        req,
        payload({
          role: UserRole.ADMIN,
          surface: AuthSurface.ADMIN,
        }),
      ),
    ).rejects.toThrow(UnauthorizedException);
  });

  it('rejects unverified ADMIN JWT with generic Unauthorized', async () => {
    prisma.user.findUnique.mockResolvedValue({
      ...mockDbUser,
      role: UserRole.ADMIN,
      emailVerifiedAt: null,
    });
    const req = buildRequest({ authorization: 'Bearer some.jwt.token' });

    await expect(
      strategy.validate(
        req,
        payload({
          role: UserRole.ADMIN,
          surface: AuthSurface.ADMIN,
        }),
      ),
    ).rejects.toThrow(UnauthorizedException);
  });

  describe('cookie extraction (surface-scoped)', () => {
    function extractFromStrategy(req: any): string | null {
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
