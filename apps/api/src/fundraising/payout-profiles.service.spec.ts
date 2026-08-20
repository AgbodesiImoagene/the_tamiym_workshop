import { ForbiddenException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../prisma/prisma.service';
import { AccountPolicyService } from '../auth/account-policy.service';
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
    await expect(
      service.create('user-1', {
        bankCode: '058',
        accountName: 'Test',
        accountNumber: '0123456789',
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.userPayoutProfile.create).not.toHaveBeenCalled();
  });

  it('rejects update and remove when email is unverified', async () => {
    prisma.user.findUnique.mockResolvedValue({ emailVerifiedAt: null });
    await expect(
      service.update('user-1', 'p1', { label: 'x' }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    await expect(service.remove('user-1', 'p1')).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });
});
