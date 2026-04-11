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

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: AuditService, useValue: audit },
        { provide: ObservabilityService, useValue: observability },
        { provide: PrismaService, useValue: prisma },
        {
          provide: JwtService,
          useValue: { sign: jest.fn().mockReturnValue('jwt') },
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
  });

  afterEach(() => {
    (bcrypt.compare as jest.Mock).mockResolvedValue(true);
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

    const result = await service.login({
      email: 'user@example.com',
      password: 'password123',
    });

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

  it('should record a failed login metric when credentials are invalid', async () => {
    prisma.user.findUnique.mockResolvedValue(null);

    await expect(
      service.login({ email: 'missing@example.com', password: 'nope' }),
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
      service.login({ email: 'user@example.com', password: 'any' }),
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

  describe('register', () => {
    it('should register a new user and enqueue verification email', async () => {
      (prisma.user.findUnique as jest.Mock).mockResolvedValue(null);
      (prisma.user.create as jest.Mock).mockResolvedValue(mockUserSelect);

      const dto = {
        email: 'test@example.com',
        password: 'Password1!',
        firstName: 'Test',
        lastName: 'User',
      };

      const result = await service.register(dto as any);

      expect(result).toEqual(mockUserSelect);
      expect(prisma.user.findUnique).toHaveBeenCalledWith({
        where: { email: dto.email },
      });
      expect(prisma.user.create).toHaveBeenCalled();
      expect(mailQueue.add).toHaveBeenCalled();
    });

    it('should throw ConflictException if email exists', async () => {
      (prisma.user.findUnique as jest.Mock).mockResolvedValue(mockUser);

      await expect(
        service.register({
          email: 'test@example.com',
          password: 'Password1!',
          firstName: 'Test',
          lastName: 'User',
        } as any),
      ).rejects.toThrow(ConflictException);
      expect(prisma.user.create).not.toHaveBeenCalled();
    });
  });

  describe('verifyEmail', () => {
    it('should verify email and delete token', async () => {
      const record = {
        id: 'token-1',
        userId: mockUser.id,
        token: 'valid-token',
        expiresAt: new Date(Date.now() + 86400000),
        user: mockUser,
      };
      (prisma.authToken.findFirst as jest.Mock).mockResolvedValue(record);
      (prisma.user.update as jest.Mock).mockResolvedValue(mockUser);
      (prisma.authToken.delete as jest.Mock).mockResolvedValue(record);

      const result = await service.verifyEmail('valid-token');

      expect(result).toEqual({ message: 'Email verified successfully' });
      expect(prisma.$transaction).toHaveBeenCalled();
    });

    it('should throw BadRequestException if token not found', async () => {
      (prisma.authToken.findFirst as jest.Mock).mockResolvedValue(null);

      await expect(service.verifyEmail('invalid')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should throw BadRequestException if token expired', async () => {
      const record = {
        id: 'token-1',
        userId: mockUser.id,
        token: 'expired-token',
        expiresAt: new Date(Date.now() - 1000),
        user: mockUser,
      };
      (prisma.authToken.findFirst as jest.Mock).mockResolvedValue(record);
      (prisma.authToken.delete as jest.Mock).mockResolvedValue(record);

      await expect(service.verifyEmail('expired-token')).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  describe('resendVerification', () => {
    it('should return success message always', async () => {
      (prisma.user.findFirst as jest.Mock).mockResolvedValue(null);

      const result = await service.resendVerification('nobody@example.com');

      expect(result.message).toContain('If an account exists');
    });

    it('should enqueue verification email when user exists and unverified', async () => {
      (prisma.user.findFirst as jest.Mock).mockResolvedValue({
        id: mockUser.id,
        email: mockUser.email,
        emailVerifiedAt: null,
      });

      await service.resendVerification(mockUser.email);

      expect(mailQueue.add).toHaveBeenCalled();
    });
  });

  describe('forgotPassword', () => {
    it('should return success message always', async () => {
      (prisma.user.findFirst as jest.Mock).mockResolvedValue(null);

      const result = await service.forgotPassword('nobody@example.com');

      expect(result.message).toContain('If an account exists');
    });

    it('should create reset token and enqueue email when user exists', async () => {
      (prisma.user.findFirst as jest.Mock).mockResolvedValue({
        id: mockUser.id,
        email: mockUser.email,
      });
      (prisma.authToken.create as jest.Mock).mockResolvedValue({});

      await service.forgotPassword(mockUser.email);

      expect(prisma.authToken.create).toHaveBeenCalled();
      expect(mailQueue.add).toHaveBeenCalled();
    });
  });

  describe('resetPassword', () => {
    it('should reset password and delete token', async () => {
      const record = {
        id: 'token-1',
        userId: mockUser.id,
        token: 'valid-reset-token',
        expiresAt: new Date(Date.now() + 3600000),
        user: mockUser,
      };
      (prisma.authToken.findFirst as jest.Mock).mockResolvedValue(record);
      (prisma.user.update as jest.Mock).mockResolvedValue(mockUser);
      (prisma.authToken.delete as jest.Mock).mockResolvedValue(record);

      const result = await service.resetPassword(
        'valid-reset-token',
        'NewPassword1!',
      );

      expect(result).toEqual({
        message: 'Password has been reset successfully',
      });
      expect(prisma.$transaction).toHaveBeenCalled();
    });

    it('should throw BadRequestException if token invalid or expired', async () => {
      (prisma.authToken.findFirst as jest.Mock).mockResolvedValue(null);

      await expect(
        service.resetPassword('invalid', 'NewPassword1!'),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('changePassword', () => {
    it('should update password when current password is correct', async () => {
      (prisma.user.findUnique as jest.Mock).mockResolvedValue({
        passwordHash: 'hashed',
      });
      (prisma.user.update as jest.Mock).mockResolvedValue(mockUser);

      const result = await service.changePassword(
        mockUser.id,
        'currentPassword',
        'NewPassword1!',
      );

      expect(result).toEqual({
        message: 'Password has been changed successfully',
      });
      expect(bcrypt.compare).toHaveBeenCalledWith('currentPassword', 'hashed');
      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: mockUser.id },
        data: { passwordHash: 'hashed' },
      });
    });

    it('should throw BadRequestException when current password is wrong', async () => {
      (prisma.user.findUnique as jest.Mock).mockResolvedValue({
        passwordHash: 'hashed',
      });
      jest.spyOn(bcrypt, 'compare').mockResolvedValue(false as never);

      await expect(
        service.changePassword(mockUser.id, 'wrong', 'NewPassword1!'),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw UnauthorizedException when user not found', async () => {
      (prisma.user.findUnique as jest.Mock).mockResolvedValue(null);

      await expect(
        service.changePassword('unknown-id', 'current', 'NewPassword1!'),
      ).rejects.toThrow(UnauthorizedException);
    });
  });

  describe('login', () => {
    it('should return access_token, refresh_token and user', async () => {
      (prisma.user.findUnique as jest.Mock).mockResolvedValue(mockUser);
      (prisma.user.update as jest.Mock).mockResolvedValue(mockUser);
      (prisma.authToken.create as jest.Mock).mockResolvedValue({});

      const result = await service.login({
        email: mockUser.email,
        password: 'password',
      } as any);

      expect(result).toHaveProperty('access_token', 'access-token');
      expect(result).toHaveProperty('refresh_token');
      expect(result.user).toMatchObject({
        id: mockUser.id,
        email: mockUser.email,
        firstName: mockUser.firstName,
        lastName: mockUser.lastName,
      });
      expect(prisma.$transaction).toHaveBeenCalled();
    });

    it('should throw UnauthorizedException for invalid credentials', async () => {
      (prisma.user.findUnique as jest.Mock).mockResolvedValue(null);

      await expect(
        service.login({ email: 'nobody@example.com', password: 'x' } as any),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('should throw UnauthorizedException when password is wrong', async () => {
      (prisma.user.findUnique as jest.Mock).mockResolvedValue(mockUser);
      (bcrypt.compare as jest.Mock).mockResolvedValue(false);

      await expect(
        service.login({ email: mockUser.email, password: 'wrong' } as any),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('should throw UnauthorizedException for deleted user', async () => {
      (prisma.user.findUnique as jest.Mock).mockResolvedValue({
        ...mockUser,
        status: 'DELETED',
      });

      await expect(
        service.login({ email: mockUser.email, password: 'x' } as any),
      ).rejects.toThrow(UnauthorizedException);
    });
  });

  describe('refresh', () => {
    it('should return new access_token and refresh_token', async () => {
      const record = {
        id: 'refresh-1',
        userId: mockUser.id,
        token: 'old-refresh-token',
        expiresAt: new Date(Date.now() + 86400000),
        user: mockUser,
      };
      (prisma.authToken.findFirst as jest.Mock).mockResolvedValue(record);
      (prisma.authToken.delete as jest.Mock).mockResolvedValue(record);
      (prisma.authToken.create as jest.Mock).mockResolvedValue({});

      const result = await service.refresh('old-refresh-token');

      expect(result).toHaveProperty('access_token', 'access-token');
      expect(result).toHaveProperty('refresh_token');
      expect(result.user.id).toBe(mockUser.id);
      expect(prisma.$transaction).toHaveBeenCalled();
    });

    it('should throw UnauthorizedException if refresh token invalid', async () => {
      (prisma.authToken.findFirst as jest.Mock).mockResolvedValue(null);

      await expect(service.refresh('invalid')).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('should throw UnauthorizedException if refresh token expired', async () => {
      const record = {
        id: 'refresh-1',
        userId: mockUser.id,
        token: 'expired',
        expiresAt: new Date(Date.now() - 1000),
        user: mockUser,
      };
      (prisma.authToken.findFirst as jest.Mock).mockResolvedValue(record);
      (prisma.authToken.delete as jest.Mock).mockResolvedValue(record);

      await expect(service.refresh('expired')).rejects.toThrow(
        UnauthorizedException,
      );
    });
  });

  describe('logout', () => {
    it('should delete refresh token when provided', async () => {
      (prisma.authToken.deleteMany as jest.Mock).mockResolvedValue({
        count: 1,
      });

      await service.logout('refresh-token');

      expect(prisma.authToken.deleteMany).toHaveBeenCalledWith({
        where: { token: 'refresh-token', tokenType: expect.any(String) },
      });
    });

    it('should do nothing when refresh token undefined', async () => {
      await service.logout(undefined);

      expect(prisma.authToken.deleteMany).not.toHaveBeenCalled();
    });
  });
});
