import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { getQueueToken } from '@nestjs/bullmq';
import { UnauthorizedException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { AuthService } from './auth.service';
import { AuditService } from '../audit/audit.service';
import { ObservabilityService } from '../observability/observability.service';
import { PrismaService } from '../prisma/prisma.service';
import { MAIL_QUEUE_NAME } from '../constants';
import { TokenType, UserRole, UserStatus } from '../generated/prisma/client';
import { AccountPolicyService } from './account-policy.service';
import { AuthSessionService } from './auth-session.service';
import { AdminMfaService } from './admin-mfa.service';
import { AuthSurface } from '../generated/prisma/enums';
import { isMfaChallengeResponse } from './auth.service';

jest.mock('bcrypt', () => ({
  compare: jest.fn(),
  hash: jest.fn(),
}));

describe('AuthService', () => {
  let service: AuthService;
  let prisma: {
    user: {
      findUnique: jest.Mock;
      findUniqueOrThrow: jest.Mock;
      update: jest.Mock;
      create: jest.Mock;
    };
    userOAuthAccount: { findUnique: jest.Mock; create: jest.Mock };
    authToken: {
      create: jest.Mock;
      findFirst: jest.Mock;
      delete: jest.Mock;
      deleteMany: jest.Mock;
    };
    $transaction: jest.Mock;
  };
  let audit: { log: jest.Mock };
  let observability: { recordAuthLogin: jest.Mock };
  let jwtService: { sign: jest.Mock };
  let authSession: {
    createSession: jest.Mock;
    requireLiveSessionByRefreshToken: jest.Mock;
    rotateSession: jest.Mock;
    revokeByRefreshToken: jest.Mock;
    revokeAllForUser: jest.Mock;
    revokeOneForUser: jest.Mock;
    listForUser: jest.Mock;
    parseDeviceLabel: jest.Mock;
  };
  let adminMfa: {
    isEnabled: jest.Mock;
    signMfaToken: jest.Mock;
    startEnrollment: jest.Mock;
    confirmEnrollment: jest.Mock;
    challenge: jest.Mock;
    recover: jest.Mock;
  };

  const liveSession = {
    id: 'sess-1',
    userId: 'user-1',
    authSurface: AuthSurface.CUSTOMER,
    refreshTokenHash: 'hash',
    deviceLabel: null,
    createdAt: new Date(),
    lastSeenAt: new Date(),
    expiresAt: new Date(Date.now() + 60_000),
    revokedAt: null,
  };

  beforeEach(async () => {
    prisma = {
      user: {
        findUnique: jest.fn(),
        findUniqueOrThrow: jest.fn(),
        update: jest.fn(),
        create: jest.fn(),
      },
      userOAuthAccount: {
        findUnique: jest.fn(),
        create: jest.fn(),
      },
      authToken: {
        create: jest.fn(),
        findFirst: jest.fn(),
        delete: jest.fn(),
        deleteMany: jest.fn(),
      },
      $transaction: jest.fn(async (callbackOrSteps: unknown) => {
        if (Array.isArray(callbackOrSteps)) {
          return Promise.all(callbackOrSteps);
        }

        return (callbackOrSteps as (tx: unknown) => Promise<unknown>)({
          user: prisma.user,
          userOAuthAccount: prisma.userOAuthAccount,
          authToken: prisma.authToken,
          auditLog: { create: jest.fn() },
        });
      }),
    };
    audit = { log: jest.fn().mockResolvedValue(undefined) };
    observability = { recordAuthLogin: jest.fn() };
    jwtService = { sign: jest.fn().mockReturnValue('jwt') };
    authSession = {
      createSession: jest.fn().mockResolvedValue({
        session: liveSession,
        refreshToken: 'refresh-plain',
      }),
      requireLiveSessionByRefreshToken: jest.fn(),
      rotateSession: jest.fn().mockResolvedValue({
        session: liveSession,
        refreshToken: 'refresh-rotated',
      }),
      revokeByRefreshToken: jest.fn(),
      revokeAllForUser: jest.fn().mockResolvedValue(1),
      revokeOneForUser: jest.fn().mockResolvedValue(undefined),
      listForUser: jest.fn().mockResolvedValue([]),
      parseDeviceLabel: jest.fn((ua?: string) => ua?.slice(0, 120) ?? null),
    };
    adminMfa = {
      isEnabled: jest.fn().mockResolvedValue(false),
      signMfaToken: jest.fn().mockReturnValue('mfa-jwt'),
      startEnrollment: jest.fn(),
      confirmEnrollment: jest.fn(),
      challenge: jest.fn(),
      recover: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: AuditService, useValue: audit },
        { provide: ObservabilityService, useValue: observability },
        { provide: PrismaService, useValue: prisma },
        {
          provide: JwtService,
          useValue: jwtService,
        },
        {
          provide: ConfigService,
          useValue: { get: jest.fn().mockReturnValue('http://localhost:3000') },
        },
        {
          provide: getQueueToken(MAIL_QUEUE_NAME),
          useValue: { add: jest.fn() },
        },
        { provide: AuthSessionService, useValue: authSession },
        { provide: AdminMfaService, useValue: adminMfa },
        AccountPolicyService,
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
    prisma = module.get(PrismaService);

    (bcrypt.compare as jest.Mock).mockResolvedValue(true);
    (bcrypt.hash as jest.Mock).mockResolvedValue('hashed-password');
  });

  afterEach(() => {
    jest.clearAllMocks();
    (bcrypt.compare as jest.Mock).mockResolvedValue(true);
    (bcrypt.hash as jest.Mock).mockResolvedValue('hashed-password');
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should write an audit log on successful login', async () => {
    prisma.user.findUnique.mockResolvedValue({
      id: 'user-1',
      email: 'user@example.com',
      passwordHash: await bcrypt.hash('password123', 10),
      firstName: 'User',
      lastName: 'Example',
      phone: null,
      role: UserRole.CUSTOMER,
      status: UserStatus.ACTIVE,
      emailVerifiedAt: new Date(),
    });
    prisma.authToken.deleteMany.mockResolvedValue({ count: 0 });
    prisma.user.update.mockResolvedValue({});

    const result = await service.login(
      {
        email: 'user@example.com',
        password: 'password123',
      },
      AuthSurface.CUSTOMER,
      { deviceLabel: 'Mozilla/5.0' },
    );

    expect(result.access_token).toBe('jwt');
    expect(result.refresh_token).toBe('refresh-plain');
    expect(authSession.createSession).toHaveBeenCalledWith(
      'user-1',
      AuthSurface.CUSTOMER,
      expect.objectContaining({ deviceLabel: 'Mozilla/5.0' }),
    );
    expect(jwtService.sign).toHaveBeenCalledWith(
      expect.objectContaining({
        surface: AuthSurface.CUSTOMER,
        sid: 'sess-1',
      }),
    );
    expect(audit.log).toHaveBeenCalledWith(
      expect.objectContaining({
        eventName: 'auth.login.succeeded',
        entityType: 'User',
        entityId: 'user-1',
      }),
      expect.anything(),
    );
    expect(observability.recordAuthLogin).toHaveBeenCalledWith({
      outcome: 'success',
    });
  });

  it('ADMIN password login returns MFA enrollment challenge without a session', async () => {
    prisma.user.findUnique.mockResolvedValue({
      id: 'user-1',
      email: 'admin@example.com',
      passwordHash: await bcrypt.hash('password123', 10),
      firstName: 'Admin',
      lastName: 'User',
      phone: null,
      role: UserRole.ADMIN,
      status: UserStatus.ACTIVE,
      emailVerifiedAt: new Date(),
    });
    adminMfa.isEnabled.mockResolvedValue(false);

    const result = await service.login(
      { email: 'admin@example.com', password: 'password123' },
      AuthSurface.ADMIN,
    );

    expect(isMfaChallengeResponse(result)).toBe(true);
    if (isMfaChallengeResponse(result)) {
      expect(result.mfa.status).toBe('ENROLLMENT_REQUIRED');
      expect(result.mfa_token).toBe('mfa-jwt');
    }
    expect(authSession.createSession).not.toHaveBeenCalled();
    expect(jwtService.sign).not.toHaveBeenCalled();
  });

  it('ADMIN password login returns MFA challenge when already enrolled', async () => {
    prisma.user.findUnique.mockResolvedValue({
      id: 'user-1',
      email: 'admin@example.com',
      passwordHash: await bcrypt.hash('password123', 10),
      firstName: 'Admin',
      lastName: 'User',
      phone: null,
      role: UserRole.ADMIN,
      status: UserStatus.ACTIVE,
      emailVerifiedAt: new Date(),
    });
    adminMfa.isEnabled.mockResolvedValue(true);

    const result = await service.login(
      { email: 'admin@example.com', password: 'password123' },
      AuthSurface.ADMIN,
    );

    expect(isMfaChallengeResponse(result)).toBe(true);
    if (isMfaChallengeResponse(result)) {
      expect(result.mfa.status).toBe('CHALLENGE_REQUIRED');
    }
    expect(authSession.createSession).not.toHaveBeenCalled();
  });

  it('signs the JWT payload with the requested surface and sid after MFA session issue', async () => {
    authSession.createSession.mockResolvedValue({
      session: { ...liveSession, authSurface: AuthSurface.ADMIN },
      refreshToken: 'admin-refresh',
    });
    prisma.authToken.deleteMany.mockResolvedValue({ count: 0 });
    prisma.user.update.mockResolvedValue({});

    await service.issueAdminSessionAfterMfa({
      id: 'user-1',
      email: 'admin@example.com',
      firstName: 'Admin',
      lastName: 'User',
      phone: null,
      role: UserRole.ADMIN,
      status: UserStatus.ACTIVE,
    });

    expect(jwtService.sign).toHaveBeenCalledWith(
      expect.objectContaining({
        surface: AuthSurface.ADMIN,
        sid: 'sess-1',
      }),
    );
    expect(authSession.createSession).toHaveBeenCalledWith(
      'user-1',
      AuthSurface.ADMIN,
      expect.anything(),
    );
  });

  it('normalizes email case/whitespace before lookup', async () => {
    prisma.user.findUnique.mockResolvedValue({
      id: 'user-1',
      email: 'user@example.com',
      passwordHash: await bcrypt.hash('password123', 10),
      firstName: 'User',
      lastName: 'Example',
      phone: null,
      role: UserRole.CUSTOMER,
      status: UserStatus.ACTIVE,
      emailVerifiedAt: new Date(),
    });
    prisma.authToken.deleteMany.mockResolvedValue({ count: 0 });
    prisma.user.update.mockResolvedValue({});

    await service.login(
      { email: '  User@Example.com  ', password: 'password123' },
      AuthSurface.CUSTOMER,
    );

    expect(prisma.user.findUnique).toHaveBeenCalledWith({
      where: { email: 'user@example.com' },
    });
  });

  it('rejects ADMIN credentials on the CUSTOMER surface (role×surface)', async () => {
    prisma.user.findUnique.mockResolvedValue({
      id: 'user-1',
      email: 'admin@example.com',
      passwordHash: await bcrypt.hash('password123', 10),
      firstName: 'Admin',
      lastName: 'User',
      phone: null,
      role: UserRole.ADMIN,
      status: UserStatus.ACTIVE,
      emailVerifiedAt: new Date(),
    });

    await expect(
      service.login(
        { email: 'admin@example.com', password: 'password123' },
        AuthSurface.CUSTOMER,
      ),
    ).rejects.toThrow(UnauthorizedException);

    expect(observability.recordAuthLogin).toHaveBeenCalledWith({
      outcome: 'denied',
    });
    expect(authSession.createSession).not.toHaveBeenCalled();
  });

  it('rejects CUSTOMER credentials on the ADMIN surface (role×surface)', async () => {
    prisma.user.findUnique.mockResolvedValue({
      id: 'user-1',
      email: 'customer@example.com',
      passwordHash: await bcrypt.hash('password123', 10),
      firstName: 'Customer',
      lastName: 'User',
      phone: null,
      role: UserRole.CUSTOMER,
      status: UserStatus.ACTIVE,
      emailVerifiedAt: new Date(),
    });

    await expect(
      service.login(
        { email: 'customer@example.com', password: 'password123' },
        AuthSurface.ADMIN,
      ),
    ).rejects.toThrow(UnauthorizedException);

    expect(observability.recordAuthLogin).toHaveBeenCalledWith({
      outcome: 'denied',
    });
  });

  it('allows ORGANIZER credentials on the CUSTOMER surface', async () => {
    prisma.user.findUnique.mockResolvedValue({
      id: 'user-1',
      email: 'organizer@example.com',
      passwordHash: await bcrypt.hash('password123', 10),
      firstName: 'Organizer',
      lastName: 'User',
      phone: null,
      role: UserRole.ORGANIZER,
      status: UserStatus.ACTIVE,
      emailVerifiedAt: new Date(),
    });
    prisma.authToken.deleteMany.mockResolvedValue({ count: 0 });
    prisma.user.update.mockResolvedValue({});

    const result = await service.login(
      { email: 'organizer@example.com', password: 'password123' },
      AuthSurface.CUSTOMER,
    );

    expect(result.access_token).toBe('jwt');
  });

  it('rejects unverified admin login with generic Invalid credentials', async () => {
    prisma.user.findUnique.mockResolvedValue({
      id: 'user-1',
      email: 'admin@example.com',
      passwordHash: await bcrypt.hash('password123', 10),
      firstName: 'Admin',
      lastName: 'User',
      phone: null,
      role: UserRole.ADMIN,
      status: UserStatus.ACTIVE,
      emailVerifiedAt: null,
    });

    await expect(
      service.login(
        { email: 'admin@example.com', password: 'password123' },
        AuthSurface.ADMIN,
      ),
    ).rejects.toThrow(UnauthorizedException);

    expect(observability.recordAuthLogin).toHaveBeenCalledWith({
      outcome: 'denied',
    });
    expect(jwtService.sign).not.toHaveBeenCalled();
  });

  it('revokes all sessions on password reset', async () => {
    prisma.authToken.findFirst.mockResolvedValue({
      id: 'reset-1',
      userId: 'user-1',
      expiresAt: new Date(Date.now() + 60_000),
      user: { id: 'user-1', role: UserRole.CUSTOMER },
    });
    prisma.authToken.delete.mockResolvedValue({});
    prisma.authToken.deleteMany.mockResolvedValue({ count: 2 });
    prisma.user.update.mockResolvedValue({});

    await service.resetPassword('reset-token', 'new-password-123');

    expect(authSession.revokeAllForUser).toHaveBeenCalledWith(
      'user-1',
      expect.anything(),
    );
    expect(prisma.authToken.deleteMany).toHaveBeenCalledWith({
      where: { userId: 'user-1', tokenType: TokenType.REFRESH },
    });
  });

  it('rejects refresh for unverified privileged roles', async () => {
    authSession.requireLiveSessionByRefreshToken.mockResolvedValue({
      ...liveSession,
      authSurface: AuthSurface.ADMIN,
    });
    prisma.user.findUnique.mockResolvedValue({
      id: 'user-1',
      email: 'admin@example.com',
      firstName: 'A',
      lastName: 'B',
      phone: null,
      role: UserRole.ADMIN,
      status: UserStatus.ACTIVE,
      emailVerifiedAt: null,
    });

    await expect(
      service.refresh('refresh-token', AuthSurface.ADMIN),
    ).rejects.toThrow(UnauthorizedException);
    expect(authSession.revokeOneForUser).toHaveBeenCalled();
  });

  it('rejects Google login for unverified organisers', async () => {
    prisma.userOAuthAccount.findUnique.mockResolvedValue({
      user: {
        id: 'user-1',
        email: 'org@example.com',
        role: UserRole.ORGANIZER,
        status: UserStatus.ACTIVE,
        emailVerifiedAt: null,
        firstName: 'O',
        lastName: 'G',
        phone: null,
      },
    });

    await expect(
      service.loginWithGoogleProfile({
        providerAccountId: 'g-1',
        email: 'org@example.com',
        emailVerified: false,
      }),
    ).rejects.toThrow(UnauthorizedException);
  });

  it('record a failed login metric when credentials are invalid', async () => {
    prisma.user.findUnique.mockResolvedValue(null);

    await expect(
      service.login(
        { email: 'missing@example.com', password: 'nope' },
        AuthSurface.CUSTOMER,
      ),
    ).rejects.toThrow(UnauthorizedException);

    expect(observability.recordAuthLogin).toHaveBeenCalledWith({
      outcome: 'failure',
    });
  });

  it('should reject password login for Google-only accounts', async () => {
    prisma.user.findUnique.mockResolvedValue({
      id: 'user-1',
      email: 'user@example.com',
      passwordHash: null,
      firstName: 'User',
      lastName: 'Example',
      phone: null,
      role: UserRole.CUSTOMER,
      status: UserStatus.ACTIVE,
      emailVerifiedAt: new Date(),
    });

    await expect(
      service.login(
        { email: 'user@example.com', password: 'any' },
        AuthSurface.CUSTOMER,
      ),
    ).rejects.toThrow(UnauthorizedException);

    expect(observability.recordAuthLogin).toHaveBeenCalledWith({
      outcome: 'failure',
    });
  });

  describe('logout', () => {
    it('should write an audit log on logout when the session is revoked', async () => {
      authSession.revokeByRefreshToken.mockResolvedValue({ userId: 'user-1' });
      prisma.user.findUnique.mockResolvedValue({
        id: 'user-1',
        role: UserRole.ADMIN,
      });

      await service.logout('refresh-token', AuthSurface.ADMIN);

      expect(authSession.revokeByRefreshToken).toHaveBeenCalledWith(
        'refresh-token',
        AuthSurface.ADMIN,
      );
      expect(audit.log).toHaveBeenCalledWith(
        expect.objectContaining({
          eventName: 'auth.logout',
          actorUserId: 'user-1',
        }),
      );
    });

    it('does not audit when revoke is a no-op (other surface / unknown)', async () => {
      authSession.revokeByRefreshToken.mockResolvedValue(null);

      await service.logout('refresh-token', AuthSurface.CUSTOMER);

      expect(audit.log).not.toHaveBeenCalled();
    });

    it('is a no-op without a refresh token', async () => {
      await service.logout(undefined, AuthSurface.CUSTOMER);

      expect(authSession.revokeByRefreshToken).not.toHaveBeenCalled();
    });
  });

  describe('refresh', () => {
    const activeUser = {
      id: 'user-1',
      email: 'user@example.com',
      firstName: 'User',
      lastName: 'Example',
      phone: null,
      role: UserRole.CUSTOMER,
      status: UserStatus.ACTIVE,
      emailVerifiedAt: new Date(),
    };

    it('rotates the session and signs a JWT with sid', async () => {
      authSession.requireLiveSessionByRefreshToken.mockResolvedValue(
        liveSession,
      );
      prisma.user.findUnique.mockResolvedValue(activeUser);
      authSession.rotateSession.mockResolvedValue({
        session: { ...liveSession, id: 'sess-1' },
        refreshToken: 'refresh-rotated',
      });

      const result = await service.refresh(
        'refresh-token',
        AuthSurface.CUSTOMER,
      );

      expect(result.access_token).toBe('jwt');
      expect(result.refresh_token).toBe('refresh-rotated');
      expect(jwtService.sign).toHaveBeenCalledWith(
        expect.objectContaining({
          surface: AuthSurface.CUSTOMER,
          sid: 'sess-1',
        }),
      );
      expect(authSession.rotateSession).toHaveBeenCalledWith(
        liveSession,
        AuthSurface.CUSTOMER,
      );
    });

    it('rejects a CUSTOMER-surface session presented on the ADMIN surface', async () => {
      authSession.requireLiveSessionByRefreshToken.mockResolvedValue(
        liveSession,
      );
      prisma.user.findUnique.mockResolvedValue(activeUser);

      await expect(
        service.refresh('refresh-token', AuthSurface.ADMIN),
      ).rejects.toThrow(UnauthorizedException);

      expect(authSession.rotateSession).not.toHaveBeenCalled();
    });

    it('rejects when the user role is not permitted on the requested surface', async () => {
      authSession.requireLiveSessionByRefreshToken.mockResolvedValue({
        ...liveSession,
        authSurface: AuthSurface.ADMIN,
      });
      prisma.user.findUnique.mockResolvedValue(activeUser);

      await expect(
        service.refresh('refresh-token', AuthSurface.ADMIN),
      ).rejects.toThrow(UnauthorizedException);

      expect(authSession.rotateSession).not.toHaveBeenCalled();
    });

    it('rejects when the refresh token does not exist', async () => {
      authSession.requireLiveSessionByRefreshToken.mockRejectedValue(
        new UnauthorizedException('Invalid or expired refresh token'),
      );

      await expect(
        service.refresh('missing-token', AuthSurface.CUSTOMER),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('revokes the session when the account is no longer active', async () => {
      authSession.requireLiveSessionByRefreshToken.mockResolvedValue(
        liveSession,
      );
      prisma.user.findUnique.mockResolvedValue({
        ...activeUser,
        status: UserStatus.SUSPENDED,
      });
      authSession.revokeOneForUser.mockResolvedValue(undefined);

      await expect(
        service.refresh('refresh-token', AuthSurface.CUSTOMER),
      ).rejects.toThrow(UnauthorizedException);
      expect(authSession.revokeOneForUser).toHaveBeenCalledWith(
        'user-1',
        'sess-1',
      );
    });
  });

  describe('session management wrappers', () => {
    it('lists, revokes one, and revokes all sessions', async () => {
      authSession.listForUser.mockResolvedValue([
        { id: 'sess-1', current: true },
      ]);
      await expect(service.listSessions('user-1', 'sess-1')).resolves.toEqual([
        { id: 'sess-1', current: true },
      ]);
      await service.revokeSession('user-1', 'sess-2');
      expect(authSession.revokeOneForUser).toHaveBeenCalledWith(
        'user-1',
        'sess-2',
      );
      authSession.revokeAllForUser.mockResolvedValue(2);
      await expect(service.revokeAllSessions('user-1')).resolves.toBe(2);
      expect(service.deviceLabelFromUserAgent('Mozilla')).toBe('Mozilla');
    });
  });

  it('revokes sessions when changing password', async () => {
    prisma.user.findUnique.mockResolvedValue({
      passwordHash: 'hashed',
    });
    prisma.user.update.mockResolvedValue({});
    prisma.authToken.deleteMany.mockResolvedValue({ count: 0 });

    await service.changePassword('user-1', 'old-pass', 'new-pass-123');

    expect(authSession.revokeAllForUser).toHaveBeenCalledWith(
      'user-1',
      expect.anything(),
    );
  });

  describe('admin MFA wrappers', () => {
    const adminUser = {
      id: 'admin-1',
      email: 'admin@example.com',
      firstName: 'A',
      lastName: 'B',
      phone: null,
      role: UserRole.ADMIN,
      status: UserStatus.ACTIVE,
    };

    it('delegates enroll/challenge/recover and issues a session', async () => {
      adminMfa.startEnrollment.mockResolvedValue({ secret: 'S' });
      adminMfa.confirmEnrollment.mockResolvedValue(adminUser);
      adminMfa.challenge.mockResolvedValue(adminUser);
      adminMfa.recover.mockResolvedValue(adminUser);
      authSession.createSession.mockResolvedValue({
        session: liveSession,
        refreshToken: 'refresh-plain',
      });
      prisma.authToken.deleteMany.mockResolvedValue({ count: 0 });
      prisma.user.update.mockResolvedValue({});

      await expect(service.adminMfaEnrollStart('tok')).resolves.toEqual({
        secret: 'S',
      });
      await expect(
        service.adminMfaEnrollConfirm('tok', '123456'),
      ).resolves.toMatchObject({ refresh_token: 'refresh-plain' });
      await expect(
        service.adminMfaChallenge('tok', '123456'),
      ).resolves.toMatchObject({ refresh_token: 'refresh-plain' });
      await expect(
        service.adminMfaRecover('tok', 'AAAA-BBBB'),
      ).resolves.toMatchObject({ refresh_token: 'refresh-plain' });
    });
  });
});
