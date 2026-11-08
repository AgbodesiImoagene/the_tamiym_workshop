import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { getQueueToken } from '@nestjs/bullmq';
import {
  BadRequestException,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
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
      updateMany: jest.Mock;
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
  let mailQueue: { add: jest.Mock };
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
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
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
    mailQueue = { add: jest.fn().mockResolvedValue(undefined) };
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
          useValue: mailQueue,
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
  describe('loginWithGoogleProfile (TTW-082)', () => {
    const existingPasswordUser = {
      id: 'user-1',
      email: 'victim@example.com',
      passwordHash: 'hash',
      firstName: 'Victim',
      lastName: 'User',
      phone: null,
      role: UserRole.CUSTOMER,
      status: UserStatus.ACTIVE,
      emailVerifiedAt: new Date('2026-01-01T00:00:00Z'),
    };

    beforeEach(() => {
      prisma.authToken.deleteMany.mockResolvedValue({ count: 0 });
      prisma.user.update.mockImplementation(
        ({ data }: { data: Record<string, unknown> }) =>
          Promise.resolve({ ...existingPasswordUser, ...data }),
      );
    });

    it('links an existing account when Google confirms the email', async () => {
      prisma.userOAuthAccount.findUnique.mockResolvedValue(null);
      prisma.user.findUnique.mockResolvedValue(existingPasswordUser);
      prisma.user.findUniqueOrThrow.mockResolvedValue(existingPasswordUser);
      prisma.userOAuthAccount.create.mockResolvedValue({});

      const result = await service.loginWithGoogleProfile({
        providerAccountId: 'g-sub-1',
        email: 'Victim@Example.com',
        emailVerified: true,
      });

      expect(prisma.userOAuthAccount.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          providerAccountId: 'g-sub-1',
          userId: 'user-1',
        }),
      });
      expect(result).toMatchObject({ refresh_token: 'refresh-plain' });
    });

    it('creates a confirmed account when Google confirms an unknown email', async () => {
      prisma.userOAuthAccount.findUnique.mockResolvedValue(null);
      prisma.user.findUnique.mockResolvedValue(null);
      prisma.user.create.mockImplementation(
        ({ data }: { data: Record<string, unknown> }) =>
          Promise.resolve({ ...data, id: 'user-new' }),
      );
      prisma.userOAuthAccount.create.mockResolvedValue({});

      await service.loginWithGoogleProfile({
        providerAccountId: 'g-sub-2',
        email: 'new@example.com',
        emailVerified: true,
        firstName: 'New',
        lastName: 'Person',
      });

      expect(prisma.user.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          email: 'new@example.com',
          emailVerifiedAt: expect.any(Date),
        }),
      });
      expect(prisma.userOAuthAccount.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          providerAccountId: 'g-sub-2',
          userId: 'user-new',
        }),
      });
    });

    it('refuses to link an existing account when Google has not confirmed the email', async () => {
      prisma.userOAuthAccount.findUnique.mockResolvedValue(null);
      prisma.user.findUnique.mockResolvedValue(existingPasswordUser);
      prisma.user.findUniqueOrThrow.mockResolvedValue(existingPasswordUser);

      await expect(
        service.loginWithGoogleProfile({
          providerAccountId: 'g-attacker',
          email: 'victim@example.com',
          emailVerified: false,
        }),
      ).rejects.toThrow(UnauthorizedException);

      expect(prisma.user.findUnique).not.toHaveBeenCalled();
      expect(prisma.userOAuthAccount.create).not.toHaveBeenCalled();
      expect(prisma.user.update).not.toHaveBeenCalled();
      expect(authSession.createSession).not.toHaveBeenCalled();
      expect(observability.recordAuthLogin).toHaveBeenCalledWith({
        outcome: 'denied',
      });
    });

    it('refuses to create an account when Google has not confirmed the email', async () => {
      prisma.userOAuthAccount.findUnique.mockResolvedValue(null);
      prisma.user.findUnique.mockResolvedValue(null);

      await expect(
        service.loginWithGoogleProfile({
          providerAccountId: 'g-sub-3',
          email: 'nobody@example.com',
          emailVerified: false,
        }),
      ).rejects.toThrow(UnauthorizedException);

      expect(prisma.user.create).not.toHaveBeenCalled();
      expect(prisma.userOAuthAccount.create).not.toHaveBeenCalled();
      expect(authSession.createSession).not.toHaveBeenCalled();
    });

    it('gives the same refusal whether or not an account exists for the email', async () => {
      prisma.userOAuthAccount.findUnique.mockResolvedValue(null);
      prisma.user.findUniqueOrThrow.mockResolvedValue(existingPasswordUser);

      prisma.user.findUnique.mockResolvedValue(existingPasswordUser);
      const withAccount = await service
        .loginWithGoogleProfile({
          providerAccountId: 'g-a',
          email: 'victim@example.com',
          emailVerified: false,
        })
        .catch((err: unknown) => err);

      prisma.user.findUnique.mockResolvedValue(null);
      const withoutAccount = await service
        .loginWithGoogleProfile({
          providerAccountId: 'g-b',
          email: 'nobody@example.com',
          emailVerified: false,
        })
        .catch((err: unknown) => err);

      expect(withAccount).toBeInstanceOf(UnauthorizedException);
      expect(withoutAccount).toBeInstanceOf(UnauthorizedException);
      expect((withAccount as Error).message).toBe(
        (withoutAccount as Error).message,
      );
    });

    it('keeps an already-linked account signing in even if the claim is now false', async () => {
      prisma.userOAuthAccount.findUnique.mockResolvedValue({
        user: existingPasswordUser,
      });

      const result = await service.loginWithGoogleProfile({
        providerAccountId: 'g-linked',
        email: 'victim@example.com',
        emailVerified: false,
      });

      expect(result).toMatchObject({ refresh_token: 'refresh-plain' });
      expect(prisma.userOAuthAccount.create).not.toHaveBeenCalled();
    });

    it('logs the refusal without the email address or provider id', async () => {
      const warn = jest
        .spyOn(Logger.prototype, 'warn')
        .mockImplementation(() => undefined);
      prisma.userOAuthAccount.findUnique.mockResolvedValue(null);
      prisma.user.findUnique.mockResolvedValue(existingPasswordUser);

      await expect(
        service.loginWithGoogleProfile({
          providerAccountId: 'g-secret-sub',
          email: 'victim@example.com',
          emailVerified: false,
        }),
      ).rejects.toThrow(UnauthorizedException);

      expect(warn).toHaveBeenCalled();
      const logged = JSON.stringify(warn.mock.calls);
      expect(logged).not.toContain('victim@example.com');
      expect(logged).not.toContain('g-secret-sub');
      warn.mockRestore();
    });
  });

  describe('loginWithGoogleProfile onto an unconfirmed account (TTW-179)', () => {
    const NOTICE_JOB = 'google-linked-password-removed-email';
    const unconfirmedUser = {
      id: 'user-9',
      email: 'owner@example.com',
      passwordHash: 'attacker-hash',
      firstName: 'Someone',
      lastName: 'Else',
      phone: '+2348000000000',
      role: UserRole.CUSTOMER as UserRole,
      status: UserStatus.ACTIVE as UserStatus,
      emailVerifiedAt: null as Date | null,
    };
    const confirmedProfile = {
      providerAccountId: 'g-owner',
      email: 'Owner@Example.com',
      emailVerified: true,
    };

    function givenExistingAccount(user: typeof unconfirmedUser) {
      prisma.userOAuthAccount.findUnique.mockResolvedValue(null);
      prisma.user.findUnique.mockResolvedValue(user);
      prisma.user.findUniqueOrThrow.mockResolvedValue(user);
      prisma.userOAuthAccount.create.mockResolvedValue({});
      prisma.authToken.deleteMany.mockResolvedValue({ count: 0 });
      prisma.user.update.mockImplementation(
        ({ data }: { data: Record<string, unknown> }) =>
          Promise.resolve({ ...user, ...data }),
      );
    }

    it('links, removes the password, revokes sessions and deletes pending tokens in one transaction', async () => {
      givenExistingAccount(unconfirmedUser);
      authSession.revokeAllForUser.mockResolvedValue(2);

      const result = await service.loginWithGoogleProfile(confirmedProfile);

      expect(result).toMatchObject({ refresh_token: 'refresh-plain' });
      expect(prisma.userOAuthAccount.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          providerAccountId: 'g-owner',
          userId: 'user-9',
        }),
      });
      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: 'user-9' },
        data: expect.objectContaining({
          passwordHash: null,
          emailVerifiedAt: expect.any(Date),
        }),
      });
      // Revoked inside the transaction (a tx client is passed), before the
      // new Google session is created.
      expect(authSession.revokeAllForUser).toHaveBeenCalledWith(
        'user-9',
        expect.anything(),
      );
      expect(
        authSession.revokeAllForUser.mock.invocationCallOrder[0],
      ).toBeLessThan(authSession.createSession.mock.invocationCallOrder[0]);
      expect(prisma.authToken.deleteMany).toHaveBeenCalledWith({
        where: {
          userId: 'user-9',
          tokenType: {
            in: [TokenType.PASSWORD_RESET, TokenType.EMAIL_VERIFICATION],
          },
        },
      });
    });

    it('makes every clean-up write through the transaction client, none through the root client', async () => {
      givenExistingAccount(unconfirmedUser);
      const tx = {
        userOAuthAccount: { create: jest.fn().mockResolvedValue({}) },
        user: {
          update: jest.fn().mockResolvedValue({
            ...unconfirmedUser,
            passwordHash: null,
            emailVerifiedAt: new Date(),
          }),
        },
        authToken: { deleteMany: jest.fn().mockResolvedValue({ count: 1 }) },
        auditLog: { create: jest.fn() },
      };
      // First transaction is the clean-up; the session one keeps the default mock.
      prisma.$transaction.mockImplementationOnce(
        (callback: (client: unknown) => Promise<unknown>) => callback(tx),
      );

      await service.loginWithGoogleProfile(confirmedProfile);

      expect(tx.userOAuthAccount.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ userId: 'user-9' }),
      });
      expect(tx.user.update).toHaveBeenCalledWith({
        where: { id: 'user-9' },
        data: expect.objectContaining({ passwordHash: null }),
      });
      expect(tx.authToken.deleteMany).toHaveBeenCalled();
      expect(authSession.revokeAllForUser).toHaveBeenCalledWith('user-9', tx);
      expect(audit.log).toHaveBeenCalledWith(
        expect.objectContaining({
          eventName: 'auth.password.removed_on_google_link',
        }),
        tx,
      );
      expect(prisma.userOAuthAccount.create).not.toHaveBeenCalled();
      expect(prisma.user.update).not.toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ passwordHash: null }),
        }),
      );
    });

    it('also secures an unconfirmed organiser account, which signs in on the customer surface', async () => {
      givenExistingAccount({ ...unconfirmedUser, role: UserRole.ORGANIZER });

      const result = await service.loginWithGoogleProfile(confirmedProfile);

      expect(result).toMatchObject({ refresh_token: 'refresh-plain' });
      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: 'user-9' },
        data: expect.objectContaining({ passwordHash: null }),
      });
      expect(authSession.revokeAllForUser).toHaveBeenCalled();
      expect(mailQueue.add).toHaveBeenCalledTimes(1);
    });

    it('writes an audit entry for the password removal without the email or provider id', async () => {
      givenExistingAccount(unconfirmedUser);
      authSession.revokeAllForUser.mockResolvedValue(2);

      await service.loginWithGoogleProfile(confirmedProfile);

      const entry = audit.log.mock.calls.find(
        ([input]: [{ eventName: string }]) =>
          input.eventName === 'auth.password.removed_on_google_link',
      );
      expect(entry).toBeDefined();
      expect(entry?.[0]).toMatchObject({
        entityType: 'User',
        entityId: 'user-9',
        actorUserId: 'user-9',
        after: { hadPassword: true, revokedSessions: 2 },
      });
      expect(entry?.[1]).toBeDefined();
      const serialized = JSON.stringify(entry?.[0]);
      expect(serialized).not.toContain('owner@example.com');
      expect(serialized).not.toContain('g-owner');
      expect(serialized).not.toContain('attacker-hash');
    });

    it('queues the notice email after the transaction commits, with no secret in it', async () => {
      givenExistingAccount(unconfirmedUser);

      await service.loginWithGoogleProfile(confirmedProfile);

      expect(mailQueue.add).toHaveBeenCalledTimes(1);
      expect(mailQueue.add).toHaveBeenCalledWith(NOTICE_JOB, {
        to: 'owner@example.com',
        settingsUrl: 'http://localhost:3000/dashboard/settings',
      });
      const auditCall = audit.log.mock.calls.findIndex(
        ([input]: [{ eventName: string }]) =>
          input.eventName === 'auth.password.removed_on_google_link',
      );
      expect(mailQueue.add.mock.invocationCallOrder[0]).toBeGreaterThan(
        audit.log.mock.invocationCallOrder[auditCall],
      );
    });

    it('keeps addresses, phone, name and designs: deletes nothing else', async () => {
      givenExistingAccount(unconfirmedUser);
      const deleteAddresses = jest.fn();
      const deleteDesigns = jest.fn();
      Object.assign(prisma, {
        address: { deleteMany: deleteAddresses, delete: deleteAddresses },
        design: { deleteMany: deleteDesigns, delete: deleteDesigns },
      });

      await service.loginWithGoogleProfile(confirmedProfile);

      expect(deleteAddresses).not.toHaveBeenCalled();
      expect(deleteDesigns).not.toHaveBeenCalled();
      for (const [args] of prisma.user.update.mock.calls as [
        { data: Record<string, unknown> },
      ][]) {
        expect(args.data).not.toHaveProperty('phone');
        expect(args.data).not.toHaveProperty('firstName');
        expect(args.data).not.toHaveProperty('lastName');
      }
    });

    it('does not sign in or send the email when the transaction fails', async () => {
      givenExistingAccount(unconfirmedUser);
      audit.log.mockRejectedValueOnce(new Error('db down'));

      await expect(
        service.loginWithGoogleProfile(confirmedProfile),
      ).rejects.toThrow('db down');

      expect(mailQueue.add).not.toHaveBeenCalled();
      expect(authSession.createSession).not.toHaveBeenCalled();
    });

    it('still signs in when the notice email cannot be queued, and logs no address', async () => {
      givenExistingAccount(unconfirmedUser);
      mailQueue.add.mockRejectedValueOnce(new Error('redis down'));
      const warn = jest
        .spyOn(Logger.prototype, 'warn')
        .mockImplementation(() => undefined);

      const result = await service.loginWithGoogleProfile(confirmedProfile);

      expect(result).toMatchObject({ refresh_token: 'refresh-plain' });
      expect(warn).toHaveBeenCalled();
      expect(JSON.stringify(warn.mock.calls)).not.toContain(
        'owner@example.com',
      );
      warn.mockRestore();
    });

    it('leaves a confirmed account untouched: password, sessions, tokens, no email', async () => {
      givenExistingAccount({
        ...unconfirmedUser,
        emailVerifiedAt: new Date('2026-01-01T00:00:00Z'),
      });

      await service.loginWithGoogleProfile(confirmedProfile);

      expect(prisma.userOAuthAccount.create).toHaveBeenCalled();
      for (const [args] of prisma.user.update.mock.calls as [
        { data: Record<string, unknown> },
      ][]) {
        expect(args.data).not.toHaveProperty('passwordHash');
      }
      expect(authSession.revokeAllForUser).not.toHaveBeenCalled();
      expect(prisma.authToken.deleteMany).not.toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            tokenType: expect.objectContaining({
              in: expect.arrayContaining([TokenType.PASSWORD_RESET]),
            }),
          }),
        }),
      );
      expect(mailQueue.add).not.toHaveBeenCalled();
    });

    it('leaves an already-linked account untouched even if its email is unconfirmed', async () => {
      prisma.userOAuthAccount.findUnique.mockResolvedValue({
        user: unconfirmedUser,
      });
      prisma.authToken.deleteMany.mockResolvedValue({ count: 0 });
      prisma.user.update.mockImplementation(
        ({ data }: { data: Record<string, unknown> }) =>
          Promise.resolve({ ...unconfirmedUser, ...data }),
      );

      await service.loginWithGoogleProfile(confirmedProfile);

      expect(prisma.userOAuthAccount.create).not.toHaveBeenCalled();
      for (const [args] of prisma.user.update.mock.calls as [
        { data: Record<string, unknown> },
      ][]) {
        expect(args.data).not.toHaveProperty('passwordHash');
      }
      expect(authSession.revokeAllForUser).not.toHaveBeenCalled();
      expect(mailQueue.add).not.toHaveBeenCalled();
    });

    it('does not remove the password of an admin whose Google sign-in is refused anyway (TTW-113)', async () => {
      givenExistingAccount({ ...unconfirmedUser, role: UserRole.ADMIN });

      await expect(
        service.loginWithGoogleProfile(confirmedProfile),
      ).rejects.toThrow(UnauthorizedException);

      for (const [args] of prisma.user.update.mock.calls as [
        { data: Record<string, unknown> },
      ][]) {
        expect(args.data).not.toHaveProperty('passwordHash');
      }
      expect(authSession.revokeAllForUser).not.toHaveBeenCalled();
      expect(mailQueue.add).not.toHaveBeenCalled();
    });

    describe('when the unconfirmed account is suspended (user decision 2026-11-08)', () => {
      const suspendedUser = {
        ...unconfirmedUser,
        status: UserStatus.SUSPENDED as UserStatus,
      };

      it('links and secures the account, then still refuses the sign-in', async () => {
        givenExistingAccount(suspendedUser);
        authSession.revokeAllForUser.mockResolvedValue(1);

        await expect(
          service.loginWithGoogleProfile(confirmedProfile),
        ).rejects.toThrow(UnauthorizedException);

        expect(prisma.userOAuthAccount.create).toHaveBeenCalledWith({
          data: expect.objectContaining({ userId: 'user-9' }),
        });
        expect(prisma.user.update).toHaveBeenCalledWith({
          where: { id: 'user-9' },
          data: expect.objectContaining({ passwordHash: null }),
        });
        expect(authSession.revokeAllForUser).toHaveBeenCalledWith(
          'user-9',
          expect.anything(),
        );
        expect(prisma.authToken.deleteMany).toHaveBeenCalledWith({
          where: {
            userId: 'user-9',
            tokenType: {
              in: [TokenType.PASSWORD_RESET, TokenType.EMAIL_VERIFICATION],
            },
          },
        });
        expect(audit.log).toHaveBeenCalledWith(
          expect.objectContaining({
            eventName: 'auth.password.removed_on_google_link',
            after: expect.objectContaining({ accountSuspended: true }),
          }),
          expect.anything(),
        );
        expect(authSession.createSession).not.toHaveBeenCalled();
      });

      it('queues the "account blocked, contact support" notice instead of the linked notice', async () => {
        givenExistingAccount(suspendedUser);

        await expect(
          service.loginWithGoogleProfile(confirmedProfile),
        ).rejects.toThrow(UnauthorizedException);

        expect(mailQueue.add).toHaveBeenCalledTimes(1);
        expect(mailQueue.add).toHaveBeenCalledWith(
          'google-linked-account-suspended-email',
          { to: 'owner@example.com' },
        );
      });

      it('gives the same generic refusal when the notice cannot be queued', async () => {
        givenExistingAccount(suspendedUser);
        mailQueue.add.mockRejectedValueOnce(new Error('redis down'));
        const warn = jest
          .spyOn(Logger.prototype, 'warn')
          .mockImplementation(() => undefined);

        await expect(
          service.loginWithGoogleProfile(confirmedProfile),
        ).rejects.toThrow(UnauthorizedException);

        expect(JSON.stringify(warn.mock.calls)).not.toContain(
          'owner@example.com',
        );
        warn.mockRestore();
      });
    });
  });

  describe('password checked, then changed or removed before the write (TTW-179 races)', () => {
    const passwordUser = {
      id: 'user-7',
      email: 'racer@example.com',
      passwordHash: 'hash-checked',
      firstName: 'Race',
      lastName: 'Condition',
      phone: null,
      role: UserRole.CUSTOMER,
      status: UserStatus.ACTIVE,
      emailVerifiedAt: new Date('2026-01-01T00:00:00Z'),
    };

    beforeEach(() => {
      prisma.authToken.deleteMany.mockResolvedValue({ count: 0 });
      prisma.user.update.mockResolvedValue({});
    });

    it('opens the password-login session only if the checked password is still the stored one', async () => {
      prisma.user.findUnique.mockResolvedValue(passwordUser);

      await service.login(
        { email: 'racer@example.com', password: 'pw' },
        AuthSurface.CUSTOMER,
      );

      expect(prisma.user.updateMany).toHaveBeenCalledWith({
        where: { id: 'user-7', passwordHash: 'hash-checked' },
        data: { lastLoginAt: expect.any(Date) },
      });
    });

    it('refuses the password login and opens no session when the password changed meanwhile', async () => {
      prisma.user.findUnique.mockResolvedValue(passwordUser);
      prisma.user.updateMany.mockResolvedValueOnce({ count: 0 });

      await expect(
        service.login(
          { email: 'racer@example.com', password: 'pw' },
          AuthSurface.CUSTOMER,
        ),
      ).rejects.toThrow('Invalid credentials');

      expect(audit.log).not.toHaveBeenCalled();
      expect(jwtService.sign).not.toHaveBeenCalled();
      expect(observability.recordAuthLogin).toHaveBeenCalledWith({
        outcome: 'failure',
      });
      expect(observability.recordAuthLogin).not.toHaveBeenCalledWith({
        outcome: 'success',
      });
    });

    it('changes the password only if the checked current password is still the stored one', async () => {
      prisma.user.findUnique.mockResolvedValue({
        passwordHash: 'hash-checked',
      });

      await service.changePassword('user-7', 'old-pass', 'new-pass-123');

      expect(prisma.user.updateMany).toHaveBeenCalledWith({
        where: { id: 'user-7', passwordHash: 'hash-checked' },
        data: { passwordHash: 'hashed-password' },
      });
    });

    it('refuses the change and writes nothing else when the password was removed meanwhile', async () => {
      prisma.user.findUnique.mockResolvedValue({
        passwordHash: 'hash-checked',
      });
      prisma.user.updateMany.mockResolvedValueOnce({ count: 0 });

      await expect(
        service.changePassword('user-7', 'old-pass', 'new-pass-123'),
      ).rejects.toThrow(BadRequestException);

      expect(audit.log).not.toHaveBeenCalled();
      expect(authSession.revokeAllForUser).not.toHaveBeenCalled();
    });
  });
});
