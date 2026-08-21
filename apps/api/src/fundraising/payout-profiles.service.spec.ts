import { ForbiddenException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import {
  ACCOUNT_POLICY_CODE,
  AccountPolicyService,
} from '../auth/account-policy.service';
import { PayoutProfilesService } from './payout-profiles.service';
import { PayoutProfileStatus } from '../generated/prisma/enums';

describe('PayoutProfilesService verification gate', () => {
  let service: PayoutProfilesService;
  let prisma: {
    user: { findUnique: jest.Mock };
    userPayoutProfile: {
      count: jest.Mock;
      create: jest.Mock;
      findUnique: jest.Mock;
      updateMany: jest.Mock;
      update: jest.Mock;
      delete: jest.Mock;
    };
    campaign: { count: jest.Mock };
    $transaction: jest.Mock;
  };

  beforeEach(async () => {
    prisma = {
      user: { findUnique: jest.fn() },
      userPayoutProfile: {
        count: jest.fn(),
        create: jest.fn(),
        findUnique: jest.fn(),
        updateMany: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
      },
      campaign: { count: jest.fn() },
      $transaction: jest.fn(async (fn: (tx: unknown) => Promise<unknown>) =>
        fn({
          userPayoutProfile: prisma.userPayoutProfile,
        }),
      ),
    };
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PayoutProfilesService,
        { provide: PrismaService, useValue: prisma },
        AccountPolicyService,
        {
          provide: ConfigService,
          useValue: {
            get: (key: string) =>
              key === 'PAYOUT_BANK_RESOLUTION_MODE' ? 'stub' : 'test',
          },
        },
      ],
    }).compile();
    service = module.get(PayoutProfilesService);
  });

  it('rejects create when email is unverified', async () => {
    prisma.user.findUnique.mockResolvedValue({ emailVerifiedAt: null });
    try {
      await service.create('user-1', {
        bankCode: '058',
        accountName: 'Test',
        accountNumber: '0123456789',
      });
      fail('expected ForbiddenException');
    } catch (err) {
      expect(err).toBeInstanceOf(ForbiddenException);
      const body = (err as ForbiddenException).getResponse() as Record<
        string,
        unknown
      >;
      expect(body.code).toBe(ACCOUNT_POLICY_CODE.EMAIL_NOT_VERIFIED);
      expect(body.action).toBe('MUTATE_PAYOUT_PROFILE');
    }
    expect(prisma.userPayoutProfile.create).not.toHaveBeenCalled();
  });

  it('creates verified stub profile as default when first', async () => {
    prisma.user.findUnique.mockResolvedValue({
      emailVerifiedAt: new Date(),
    });
    prisma.userPayoutProfile.count.mockResolvedValue(0);
    prisma.userPayoutProfile.updateMany.mockResolvedValue({ count: 0 });
    prisma.userPayoutProfile.create.mockResolvedValue({
      id: 'p1',
      status: PayoutProfileStatus.VERIFIED,
      isDefault: true,
    });

    await service.create('user-1', {
      bankCode: '058',
      accountName: 'Test',
      accountNumber: '0123456789',
    });

    expect(prisma.userPayoutProfile.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          isDefault: true,
          status: PayoutProfileStatus.VERIFIED,
          bankResolutionStatus: 'STUB_MATCH',
          destinationVersion: 1,
        }),
      }),
    );
  });

  it('bumps destinationVersion and re-verifies on bank edit in stub mode', async () => {
    prisma.user.findUnique.mockResolvedValue({
      emailVerifiedAt: new Date(),
    });
    prisma.userPayoutProfile.findUnique.mockResolvedValue({
      id: 'p1',
      userId: 'user-1',
      bankCode: '058',
      accountName: 'Old',
      accountNumber: '0123456789',
      bankName: null,
      status: PayoutProfileStatus.VERIFIED,
      bankResolutionStatus: 'STUB_MATCH',
      destinationVersion: 1,
      verifiedAt: new Date(),
      isDefault: true,
    });
    prisma.userPayoutProfile.update.mockResolvedValue({ id: 'p1' });
    prisma.userPayoutProfile.updateMany.mockResolvedValue({ count: 0 });

    await service.update('user-1', 'p1', {
      accountNumber: '0987654321',
      isDefault: true,
    });

    expect(prisma.userPayoutProfile.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          accountNumber: '0987654321',
          destinationVersion: 2,
          recipientCode: null,
          status: PayoutProfileStatus.VERIFIED,
          bankResolutionStatus: 'STUB_MATCH',
        }),
      }),
    );
  });

  it('resets to pending when bank edits under live mode', async () => {
    const liveModule = await Test.createTestingModule({
      providers: [
        PayoutProfilesService,
        { provide: PrismaService, useValue: prisma },
        AccountPolicyService,
        {
          provide: ConfigService,
          useValue: {
            get: (key: string) =>
              key === 'PAYOUT_BANK_RESOLUTION_MODE' ? 'live' : 'test',
          },
        },
      ],
    }).compile();
    const liveService = liveModule.get(PayoutProfilesService);
    prisma.user.findUnique.mockResolvedValue({ emailVerifiedAt: new Date() });
    prisma.userPayoutProfile.findUnique.mockResolvedValue({
      id: 'p1',
      userId: 'user-1',
      bankCode: '058',
      accountName: 'Old',
      accountNumber: '0123456789',
      bankName: null,
      status: PayoutProfileStatus.VERIFIED,
      bankResolutionStatus: 'LIVE_MATCH',
      destinationVersion: 2,
      verifiedAt: new Date(),
      isDefault: false,
    });
    prisma.userPayoutProfile.update.mockResolvedValue({ id: 'p1' });

    await liveService.update('user-1', 'p1', { bankCode: '033' });

    expect(prisma.userPayoutProfile.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          bankCode: '033',
          destinationVersion: 3,
          status: PayoutProfileStatus.PENDING_VERIFICATION,
          bankResolutionStatus: null,
          recipientCode: null,
        }),
      }),
    );
  });

  it('creates pending profile in live bank-resolution mode', async () => {
    const liveModule = await Test.createTestingModule({
      providers: [
        PayoutProfilesService,
        { provide: PrismaService, useValue: prisma },
        AccountPolicyService,
        {
          provide: ConfigService,
          useValue: {
            get: (key: string) =>
              key === 'PAYOUT_BANK_RESOLUTION_MODE' ? 'live' : 'test',
          },
        },
      ],
    }).compile();
    const liveService = liveModule.get(PayoutProfilesService);
    prisma.user.findUnique.mockResolvedValue({ emailVerifiedAt: new Date() });
    prisma.userPayoutProfile.count.mockResolvedValue(1);
    prisma.userPayoutProfile.create.mockResolvedValue({ id: 'p2' });

    await liveService.create('user-1', {
      bankCode: '058',
      accountName: 'Test',
      accountNumber: '0123456789',
    });

    expect(prisma.userPayoutProfile.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          isDefault: false,
          status: PayoutProfileStatus.PENDING_VERIFICATION,
          bankResolutionStatus: null,
        }),
      }),
    );
  });

  it('adminSetStatus verifies a pending profile', async () => {
    prisma.userPayoutProfile.findUnique.mockResolvedValue({
      id: 'p1',
      status: PayoutProfileStatus.PENDING_VERIFICATION,
      bankResolutionStatus: null,
      verifiedAt: null,
      rejectedAt: null,
      suspendedAt: null,
    });
    prisma.userPayoutProfile.update.mockResolvedValue({ id: 'p1' });

    await service.adminSetStatus('p1', PayoutProfileStatus.VERIFIED);

    expect(prisma.userPayoutProfile.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: PayoutProfileStatus.VERIFIED,
          bankResolutionStatus: 'LIVE_MATCH',
        }),
      }),
    );
  });

  it('rejects update and remove when email is unverified', async () => {
    prisma.user.findUnique.mockResolvedValue({ emailVerifiedAt: null });
    try {
      await service.update('user-1', 'p1', { label: 'x' });
      fail('expected ForbiddenException');
    } catch (err) {
      expect(err).toBeInstanceOf(ForbiddenException);
      const body = (err as ForbiddenException).getResponse() as Record<
        string,
        unknown
      >;
      expect(body.code).toBe(ACCOUNT_POLICY_CODE.EMAIL_NOT_VERIFIED);
    }
    try {
      await service.remove('user-1', 'p1');
      fail('expected ForbiddenException');
    } catch (err) {
      expect(err).toBeInstanceOf(ForbiddenException);
      const body = (err as ForbiddenException).getResponse() as Record<
        string,
        unknown
      >;
      expect(body.code).toBe(ACCOUNT_POLICY_CODE.EMAIL_NOT_VERIFIED);
    }
  });
});
