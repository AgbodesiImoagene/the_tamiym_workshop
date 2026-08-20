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
import { AuthSurface } from '../generated/prisma/enums';

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
    });
    prisma.authToken.create.mockResolvedValue({});
    prisma.user.update.mockResolvedValue({});

    const result = await service.login(
      {
        email: 'user@example.com',
        password: 'password123',
      },
      AuthSurface.CUSTOMER,
    );

    expect(result.access_token).toBe('jwt');
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

  it('signs the JWT payload with the requested surface', async () => {
    prisma.user.findUnique.mockResolvedValue({
      id: 'user-1',
      email: 'admin@example.com',
      passwordHash: await bcrypt.hash('password123', 10),
      firstName: 'Admin',
      lastName: 'User',
      phone: null,
      role: UserRole.ADMIN,
      status: UserStatus.ACTIVE,
    });
    prisma.authToken.create.mockResolvedValue({});
    prisma.authToken.deleteMany.mockResolvedValue({ count: 0 });
    prisma.user.update.mockResolvedValue({});

    await service.login(
      { email: 'admin@example.com', password: 'password123' },
      AuthSurface.ADMIN,
    );

    expect(jwtService.sign).toHaveBeenCalledWith(
      expect.objectContaining({ surface: AuthSurface.ADMIN }),
    );
    expect(prisma.authToken.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ authSurface: AuthSurface.ADMIN }),
      }),
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
    });
    prisma.authToken.create.mockResolvedValue({});
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
    expect(prisma.authToken.create).not.toHaveBeenCalled();
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
    });
    prisma.authToken.create.mockResolvedValue({});
    prisma.authToken.deleteMany.mockResolvedValue({ count: 0 });
    prisma.user.update.mockResolvedValue({});

    const result = await service.login(
      { email: 'organizer@example.com', password: 'password123' },
      AuthSurface.CUSTOMER,
    );

    expect(result.access_token).toBe('jwt');
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

  it('should write an audit log on logout when the refresh token exists', async () => {
    prisma.authToken.findFirst.mockResolvedValue({
      id: 'auth-token-1',
      userId: 'user-1',
      token: 'refresh-token',
      tokenType: TokenType.REFRESH,
      expiresAt: new Date(Date.now() + 60_000),
      user: { id: 'user-1', role: UserRole.ADMIN },
    });
    prisma.authToken.deleteMany.mockResolvedValue({ count: 1 });

    await service.logout('refresh-token');

    expect(prisma.authToken.deleteMany).toHaveBeenCalled();
    expect(audit.log).toHaveBeenCalledWith(
      expect.objectContaining({
        eventName: 'auth.logout',
        actorUserId: 'user-1',
      }),
      expect.anything(),
    );
  });

  describe('refresh', () => {
    const baseRecord = {
      id: 'auth-token-1',
      userId: 'user-1',
      token: 'refresh-token',
      tokenType: TokenType.REFRESH,
      expiresAt: new Date(Date.now() + 60_000),
      user: {
        id: 'user-1',
        email: 'user@example.com',
        firstName: 'User',
        lastName: 'Example',
        phone: null,
        role: UserRole.CUSTOMER,
        status: UserStatus.ACTIVE,
      },
    };

    it('rotates the refresh token and upgrades a legacy (null-surface) token', async () => {
      prisma.authToken.findFirst.mockResolvedValue({
        ...baseRecord,
        authSurface: null,
      });
      prisma.authToken.delete.mockResolvedValue({});
      prisma.authToken.deleteMany.mockResolvedValue({ count: 0 });
      prisma.authToken.create.mockResolvedValue({});

      const result = await service.refresh(
        'refresh-token',
        AuthSurface.CUSTOMER,
      );

      expect(result.access_token).toBe('jwt');
      expect(jwtService.sign).toHaveBeenCalledWith(
        expect.objectContaining({ surface: AuthSurface.CUSTOMER }),
      );
      expect(prisma.authToken.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            authSurface: AuthSurface.CUSTOMER,
          }),
        }),
      );
    });

    it('rejects a CUSTOMER-surface refresh token presented on the ADMIN surface', async () => {
      prisma.authToken.findFirst.mockResolvedValue({
        ...baseRecord,
        authSurface: AuthSurface.CUSTOMER,
      });

      await expect(
        service.refresh('refresh-token', AuthSurface.ADMIN),
      ).rejects.toThrow(UnauthorizedException);

      expect(prisma.authToken.create).not.toHaveBeenCalled();
    });

    it('rejects when the user role is not permitted on the requested surface', async () => {
      prisma.authToken.findFirst.mockResolvedValue({
        ...baseRecord,
        authSurface: null,
      });

      await expect(
        service.refresh('refresh-token', AuthSurface.ADMIN),
      ).rejects.toThrow(UnauthorizedException);

      expect(prisma.authToken.create).not.toHaveBeenCalled();
    });

    it('rejects when the refresh token does not exist', async () => {
      prisma.authToken.findFirst.mockResolvedValue(null);

      await expect(
        service.refresh('missing-token', AuthSurface.CUSTOMER),
      ).rejects.toThrow(UnauthorizedException);
    });
  });
});
