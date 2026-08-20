import { ForbiddenException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../prisma/prisma.service';
import {
  ACCOUNT_POLICY_CODE,
  AccountPolicyService,
} from '../auth/account-policy.service';
import { PayoutProfilesService } from './payout-profiles.service';

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
    };
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PayoutProfilesService,
        { provide: PrismaService, useValue: prisma },
        AccountPolicyService,
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
