import { BadRequestException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../prisma/prisma.service';
import { isPayoutAutoExecuteEnabled } from '../payouts/payout-eligibility';
import { assertAutoExecuteModeAllowed } from '../payouts/payout-eligibility.helpers';
import { AdminSiteSettingsController } from './admin-site-settings.controller';

describe('AdminSiteSettingsController AUTO_EXECUTE gate', () => {
  it('rejects AUTO_EXECUTE when env gate is off via shared helper', () => {
    expect(() =>
      assertAutoExecuteModeAllowed(
        'AUTO_EXECUTE',
        isPayoutAutoExecuteEnabled(undefined),
      ),
    ).toThrow(BadRequestException);
  });

  it('update path invokes assert for AUTO_EXECUTE', async () => {
    const prev = process.env.PAYOUT_AUTO_EXECUTE_ENABLED;
    delete process.env.PAYOUT_AUTO_EXECUTE_ENABLED;
    const prisma = {
      siteSettings: {
        findUnique: jest.fn().mockResolvedValue(null),
        upsert: jest.fn(),
      },
    };
    const module = await Test.createTestingModule({
      controllers: [AdminSiteSettingsController],
      providers: [
        { provide: PrismaService, useValue: prisma },
        { provide: AuditService, useValue: { log: jest.fn() } },
      ],
    }).compile();
    const controller = module.get(AdminSiteSettingsController);
    try {
      await expect(
        controller.update(
          { payoutMode: 'AUTO_EXECUTE' } as never,
          { id: 'admin', role: 'ADMIN' } as never,
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
    } finally {
      if (prev === undefined) delete process.env.PAYOUT_AUTO_EXECUTE_ENABLED;
      else process.env.PAYOUT_AUTO_EXECUTE_ENABLED = prev;
    }
  });
});

describe('AdminSiteSettingsController VAT on first save (TTW-084)', () => {
  async function build(existing: unknown) {
    const prisma = {
      siteSettings: {
        findUnique: jest.fn().mockResolvedValue(existing),
        upsert: jest.fn().mockImplementation(({ create, update }) =>
          Promise.resolve({
            id: 'default',
            vatRate: 0.075,
            pricesIncludeVat: true,
            vatAppliesToShipping: true,
            currency: 'NGN',
            payoutMode: 'MANUAL',
            payoutCadenceDays: 7,
            payoutSettlementHoldDays: 7,
            minimumPayoutAmount: null,
            autoRetryFailedPayouts: true,
            ...(existing ? update : create),
          }),
        ),
      },
    };
    const module = await Test.createTestingModule({
      controllers: [AdminSiteSettingsController],
      providers: [
        { provide: PrismaService, useValue: prisma },
        { provide: AuditService, useValue: { log: jest.fn() } },
      ],
    }).compile();
    return { prisma, controller: module.get(AdminSiteSettingsController) };
  }

  const admin = { id: 'admin', role: 'ADMIN' } as never;

  it('refuses to create the settings row without a VAT rate', async () => {
    const { prisma, controller } = await build(null);
    await expect(
      controller.update({ payoutCadenceDays: 14 } as never, admin),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.siteSettings.upsert).not.toHaveBeenCalled();
  });

  it('creates the settings row when the VAT rate is given', async () => {
    const { prisma, controller } = await build(null);
    await controller.update({ vatRate: 0.075 } as never, admin);
    expect(prisma.siteSettings.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({ vatRate: 0.075 }),
      }),
    );
  });

  it('updates other fields of an existing row without a VAT rate', async () => {
    const { prisma, controller } = await build({
      id: 'default',
      vatRate: 0.075,
      minimumPayoutAmount: null,
    });
    await controller.update({ payoutCadenceDays: 14 } as never, admin);
    expect(prisma.siteSettings.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ update: { payoutCadenceDays: 14 } }),
    );
  });
});
