import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  GoneException,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import * as bcrypt from 'bcrypt';
import { PrivacyService } from './privacy.service';
import { PrismaService } from '../prisma/prisma.service';
import { AuthSessionService } from '../auth/auth-session.service';
import { AuditService } from '../audit/audit.service';
import {
  PrivacyRequestStatus,
  PrivacyRequestType,
  UserStatus,
} from '../generated/prisma/enums';
import {
  PRIVACY_OPEN_OBLIGATIONS,
  PRIVACY_PASSWORD_REQUIRED,
} from './privacy.constants';

describe('PrivacyService', () => {
  let service: PrivacyService;
  const prisma = {
    $transaction: jest.fn(),
    privacyRequest: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
    },
    privacyRequestAction: { create: jest.fn() },
    user: {
      findUnique: jest.fn(),
      findUniqueOrThrow: jest.fn(),
      update: jest.fn(),
    },
    address: { findMany: jest.fn(), updateMany: jest.fn() },
    order: { findMany: jest.fn(), count: jest.fn(), updateMany: jest.fn() },
    campaign: { count: jest.fn(), updateMany: jest.fn() },
    payout: { count: jest.fn() },
    userPayoutProfile: { updateMany: jest.fn() },
    authToken: { deleteMany: jest.fn() },
    adminMfaRecoveryCode: { deleteMany: jest.fn() },
    adminMfaCredential: { deleteMany: jest.fn() },
    userOAuthAccount: { deleteMany: jest.fn() },
    design: { findMany: jest.fn(), updateMany: jest.fn() },
    designShareLink: { updateMany: jest.fn() },
  };
  const authSessions = { revokeAllForUser: jest.fn() };
  const audit = { log: jest.fn() };

  beforeEach(async () => {
    jest.resetAllMocks();
    prisma.$transaction.mockImplementation(
      async (fn: (tx: typeof prisma) => Promise<unknown>) => fn(prisma),
    );
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PrivacyService,
        { provide: PrismaService, useValue: prisma },
        { provide: AuthSessionService, useValue: authSessions },
        { provide: AuditService, useValue: audit },
      ],
    }).compile();
    service = module.get(PrivacyService);
  });

  async function stubActivePassword() {
    prisma.user.findUnique.mockResolvedValue({
      passwordHash: await bcrypt.hash('TestPassword1!', 4),
      status: UserStatus.ACTIVE,
    });
  }

  it('lists and gets owned requests', async () => {
    prisma.privacyRequest.findMany.mockResolvedValue([{ id: 'r1' }]);
    await expect(service.listForUser('u1')).resolves.toEqual([{ id: 'r1' }]);
    prisma.privacyRequest.findFirst.mockResolvedValue({
      id: 'r1',
      actions: [],
    });
    await expect(service.getForUser('u1', 'r1')).resolves.toMatchObject({
      id: 'r1',
    });
    prisma.privacyRequest.findFirst.mockResolvedValue(null);
    await expect(service.getForUser('u1', 'missing')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('creates an export package', async () => {
    await stubActivePassword();
    const expires = new Date(Date.now() + 60_000);
    prisma.privacyRequest.create.mockResolvedValue({
      id: 'exp-new',
      type: PrivacyRequestType.EXPORT,
      status: PrivacyRequestStatus.COMPLETED,
      policyVersion: 'privacy-policy/v1-interim-2026-08-20',
      exportExpiresAt: expires,
    });
    prisma.privacyRequestAction.create.mockResolvedValue({});
    audit.log.mockResolvedValue({});
    const result = await service.requestExport('u1', 'TestPassword1!');
    expect(result.downloadPath).toContain('exp-new');
    expect(audit.log).toHaveBeenCalled();
  });

  it('cancels an unexpired export download', async () => {
    prisma.privacyRequest.findFirst.mockResolvedValue({
      id: 'exp-3',
      userId: 'u1',
      type: PrivacyRequestType.EXPORT,
      status: PrivacyRequestStatus.COMPLETED,
      exportExpiresAt: new Date(Date.now() + 60_000),
    });
    prisma.privacyRequest.update.mockResolvedValue({
      id: 'exp-3',
      status: PrivacyRequestStatus.CANCELLED,
    });
    await expect(service.cancel('u1', 'exp-3')).resolves.toMatchObject({
      status: PrivacyRequestStatus.CANCELLED,
    });
  });

  it('rejects cancelling erasure requests', async () => {
    prisma.privacyRequest.findFirst.mockResolvedValue({
      id: 'er1',
      type: PrivacyRequestType.ERASURE,
      status: PrivacyRequestStatus.IN_PROGRESS,
    });
    await expect(service.cancel('u1', 'er1')).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('rejects a second completed erasure', async () => {
    await stubActivePassword();
    prisma.order.count.mockResolvedValue(0);
    prisma.campaign.count.mockResolvedValue(0);
    prisma.payout.count.mockResolvedValue(0);
    prisma.privacyRequest.findFirst.mockResolvedValue({
      id: 'done',
      status: PrivacyRequestStatus.COMPLETED,
      legalHoldUntil: null,
    });
    await expect(
      service.requestErasure('u1', 'TestPassword1!'),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('returns an active legal hold without re-running executors', async () => {
    await stubActivePassword();
    prisma.order.count.mockResolvedValue(0);
    prisma.campaign.count.mockResolvedValue(0);
    prisma.payout.count.mockResolvedValue(0);
    prisma.privacyRequest.findFirst
      .mockResolvedValueOnce({
        id: 'held',
        status: PrivacyRequestStatus.HELD,
        legalHoldUntil: new Date(Date.now() + 86_400_000),
      })
      .mockResolvedValueOnce({
        id: 'held',
        status: PrivacyRequestStatus.HELD,
        actions: [],
      });
    const result = await service.requestErasure('u1', 'TestPassword1!');
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(result.id).toBe('held');
  });

  it('rejects export without a valid password', async () => {
    await stubActivePassword();
    await expect(
      service.requestExport('u1', 'wrong-pass'),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('rejects OAuth-only accounts with PRIVACY_PASSWORD_REQUIRED', async () => {
    prisma.user.findUnique.mockResolvedValue({
      passwordHash: null,
      status: UserStatus.ACTIVE,
    });
    try {
      await service.requestExport('u1', 'TestPassword1!');
      fail('expected ForbiddenException');
    } catch (err) {
      expect(err).toBeInstanceOf(ForbiddenException);
      const body = (err as ForbiddenException).getResponse() as Record<
        string,
        unknown
      >;
      expect(body.code).toBe(PRIVACY_PASSWORD_REQUIRED);
    }
  });

  it('blocks erasure when open orders remain', async () => {
    await stubActivePassword();
    prisma.order.count.mockResolvedValue(1);
    prisma.campaign.count.mockResolvedValue(0);
    prisma.payout.count.mockResolvedValue(0);
    try {
      await service.requestErasure('u1', 'TestPassword1!');
      fail('expected ForbiddenException');
    } catch (err) {
      expect(err).toBeInstanceOf(ForbiddenException);
      const body = (err as ForbiddenException).getResponse() as Record<
        string,
        unknown
      >;
      expect(body.code).toBe(PRIVACY_OPEN_OBLIGATIONS);
    }
  });

  it('completes erasure when no open obligations', async () => {
    await stubActivePassword();
    prisma.order.count.mockResolvedValue(0);
    prisma.campaign.count.mockResolvedValue(0);
    prisma.payout.count.mockResolvedValue(0);
    prisma.privacyRequest.findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({
        id: 'req-1',
        status: PrivacyRequestStatus.COMPLETED,
        actions: [],
      });
    prisma.privacyRequest.create.mockResolvedValue({
      id: 'req-1',
      userId: 'u1',
      type: PrivacyRequestType.ERASURE,
      status: PrivacyRequestStatus.IN_PROGRESS,
    });
    prisma.privacyRequest.updateMany.mockResolvedValue({ count: 1 });
    prisma.privacyRequest.findUnique.mockResolvedValue({
      legalHoldUntil: null,
    });
    authSessions.revokeAllForUser.mockResolvedValue(2);
    prisma.authToken.deleteMany.mockResolvedValue({ count: 0 });
    prisma.adminMfaRecoveryCode.deleteMany.mockResolvedValue({ count: 0 });
    prisma.adminMfaCredential.deleteMany.mockResolvedValue({ count: 0 });
    prisma.userOAuthAccount.deleteMany.mockResolvedValue({ count: 0 });
    prisma.address.updateMany.mockResolvedValue({ count: 1 });
    prisma.order.updateMany.mockResolvedValue({ count: 0 });
    prisma.userPayoutProfile.updateMany.mockResolvedValue({ count: 1 });
    prisma.campaign.updateMany.mockResolvedValue({ count: 0 });
    prisma.design.updateMany.mockResolvedValue({ count: 1 });
    prisma.designShareLink.updateMany.mockResolvedValue({ count: 1 });
    prisma.user.update.mockResolvedValue({});
    prisma.privacyRequestAction.create.mockResolvedValue({});
    prisma.privacyRequest.update.mockResolvedValue({});
    audit.log.mockResolvedValue({});

    const result = await service.requestErasure('u1', 'TestPassword1!');
    expect(authSessions.revokeAllForUser).toHaveBeenCalledWith('u1', prisma);
    expect(prisma.user.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'u1' },
        data: expect.objectContaining({ status: UserStatus.DELETED }),
      }),
    );
    expect(prisma.userPayoutProfile.updateMany).toHaveBeenCalled();
    expect(result.id).toBe('req-1');
  });

  it('resumes a stuck IN_PROGRESS erasure request', async () => {
    await stubActivePassword();
    prisma.order.count.mockResolvedValue(0);
    prisma.campaign.count.mockResolvedValue(0);
    prisma.payout.count.mockResolvedValue(0);
    prisma.privacyRequest.findFirst
      .mockResolvedValueOnce({
        id: 'req-stuck',
        status: PrivacyRequestStatus.IN_PROGRESS,
        legalHoldUntil: null,
      })
      .mockResolvedValueOnce({
        id: 'req-stuck',
        status: PrivacyRequestStatus.COMPLETED,
        actions: [],
      });
    prisma.privacyRequest.updateMany.mockResolvedValue({ count: 1 });
    prisma.privacyRequest.findUnique.mockResolvedValue({
      legalHoldUntil: null,
    });
    authSessions.revokeAllForUser.mockResolvedValue(1);
    prisma.authToken.deleteMany.mockResolvedValue({ count: 0 });
    prisma.adminMfaRecoveryCode.deleteMany.mockResolvedValue({ count: 0 });
    prisma.adminMfaCredential.deleteMany.mockResolvedValue({ count: 0 });
    prisma.userOAuthAccount.deleteMany.mockResolvedValue({ count: 0 });
    prisma.address.updateMany.mockResolvedValue({ count: 0 });
    prisma.order.updateMany.mockResolvedValue({ count: 0 });
    prisma.userPayoutProfile.updateMany.mockResolvedValue({ count: 0 });
    prisma.campaign.updateMany.mockResolvedValue({ count: 0 });
    prisma.design.updateMany.mockResolvedValue({ count: 0 });
    prisma.designShareLink.updateMany.mockResolvedValue({ count: 0 });
    prisma.user.update.mockResolvedValue({});
    prisma.privacyRequestAction.create.mockResolvedValue({});
    prisma.privacyRequest.update.mockResolvedValue({});
    audit.log.mockResolvedValue({});

    const result = await service.requestErasure('u1', 'TestPassword1!');
    expect(prisma.privacyRequest.create).not.toHaveBeenCalled();
    expect(prisma.user.update).toHaveBeenCalled();
    expect(result.id).toBe('req-stuck');
  });

  it('holds erasure when legalHoldUntil is in the future', async () => {
    await stubActivePassword();
    prisma.order.count.mockResolvedValue(0);
    prisma.campaign.count.mockResolvedValue(0);
    prisma.payout.count.mockResolvedValue(0);
    prisma.privacyRequest.findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({
        id: 'req-hold',
        status: PrivacyRequestStatus.HELD,
        actions: [],
      });
    prisma.privacyRequest.create.mockResolvedValue({
      id: 'req-hold',
      userId: 'u1',
      type: PrivacyRequestType.ERASURE,
      status: PrivacyRequestStatus.IN_PROGRESS,
    });
    prisma.privacyRequest.findUnique.mockResolvedValue({
      legalHoldUntil: new Date(Date.now() + 86_400_000),
    });
    prisma.privacyRequestAction.create.mockResolvedValue({});
    prisma.privacyRequest.update.mockResolvedValue({});
    prisma.privacyRequest.updateMany.mockResolvedValue({ count: 1 });

    const result = await service.requestErasure('u1', 'TestPassword1!');
    expect(authSessions.revokeAllForUser).not.toHaveBeenCalled();
    expect(prisma.privacyRequest.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { status: PrivacyRequestStatus.HELD },
      }),
    );
    expect(result.status).toBe(PrivacyRequestStatus.HELD);
  });

  it('rejects expired export downloads', async () => {
    await stubActivePassword();
    prisma.privacyRequest.findFirst.mockResolvedValue({
      id: 'exp-1',
      userId: 'u1',
      type: PrivacyRequestType.EXPORT,
      status: PrivacyRequestStatus.COMPLETED,
      exportExpiresAt: new Date(Date.now() - 1000),
    });
    await expect(
      service.downloadExport('u1', 'exp-1', 'TestPassword1!'),
    ).rejects.toBeInstanceOf(GoneException);
  });

  it('packages an export for the owning user only', async () => {
    await stubActivePassword();
    const expires = new Date(Date.now() + 60_000);
    prisma.privacyRequest.findFirst.mockResolvedValue({
      id: 'exp-2',
      userId: 'u1',
      type: PrivacyRequestType.EXPORT,
      status: PrivacyRequestStatus.COMPLETED,
      exportExpiresAt: expires,
    });
    prisma.privacyRequest.update.mockResolvedValue({});
    prisma.user.findUniqueOrThrow.mockResolvedValue({
      id: 'u1',
      email: 'a@example.com',
      firstName: 'A',
      lastName: 'B',
      phone: null,
      role: 'CUSTOMER',
      status: UserStatus.ACTIVE,
      emailVerifiedAt: null,
      createdAt: new Date(),
    });
    prisma.design.findMany.mockResolvedValue([
      {
        id: 'd1',
        name: 'Design',
        productId: 'p1',
        campaignId: null,
        moderationStatus: 'APPROVED',
        createdAt: new Date(),
        updatedAt: new Date(),
        shareLinks: [
          {
            id: 'l1',
            expiresAt: new Date(Date.now() + 60_000),
            revokedAt: null,
            createdAt: new Date(),
          },
        ],
      },
    ]);
    audit.log.mockResolvedValue({});

    const payload = await service.downloadExport(
      'u1',
      'exp-2',
      'TestPassword1!',
    );
    expect(payload.data.user.id).toBe('u1');
    expect(payload.data.designs[0].hadShareLink).toBe(true);
    expect(payload.data.designs[0].activeShareLinkCount).toBe(1);
    expect(payload.checksum).toMatch(/^[a-f0-9]{64}$/);
  });
});
