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
