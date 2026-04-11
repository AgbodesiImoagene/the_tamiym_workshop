import { Test, TestingModule } from '@nestjs/testing';
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { PayoutsService } from './payouts.service';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../prisma/prisma.service';
import { ConfigService } from '@nestjs/config';
import { CampaignLedgerService } from './campaign-ledger.service';
import { PayoutStatus } from '../generated/prisma/enums';
import { ObservabilityService } from '../observability/observability.service';
import { NotificationOutboxDeliveryService } from '../mail/notification-outbox-delivery.service';
import { AdminNotifyService } from '../admin-notifications/admin-notify.service';

describe('PayoutsService', () => {
  let service: PayoutsService;
  let prisma: jest.Mocked<PrismaService>;
  let campaignLedger: jest.Mocked<CampaignLedgerService>;

  const mockPayout = {
    id: 'payout-1',
    campaignId: 'campaign-1',
    isManualAdjustment: true,
    status: PayoutStatus.PENDING_APPROVAL,
    requestedByUserId: 'user-requester',
    amount: 5000,
    currency: 'NGN',
    campaign: {
      organizerId: 'org-1',
      payoutProfile: { id: 'profile-1' },
      organizer: { payoutProfiles: [{ id: 'profile-1' }] },
    },
  };

  beforeEach(async () => {
    const mockPrisma = {
      payout: { findUnique: jest.fn(), update: jest.fn() },
      campaign: { findUnique: jest.fn() },
      auditLog: { create: jest.fn().mockResolvedValue({}) },
    };
    const mockCampaignLedger = {
      createManualAdjustment: jest.fn().mockResolvedValue(undefined),
    };
    const mockConfig = {
      get: jest.fn((key: string) =>
        key === 'PAYSTACK_SECRET_KEY' ? 'sk_test' : undefined,
      ),
    };
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PayoutsService,
        { provide: AuditService, useValue: { log: jest.fn() } },
        {
          provide: ObservabilityService,
          useValue: {
            startSpan: jest.fn(
              async (
                _name: string,
                _attributes: Record<string, unknown>,
                callback: () => Promise<unknown>,
              ) => callback(),
            ),
            recordPayout: jest.fn(),
          },
        },
        { provide: PrismaService, useValue: mockPrisma },
        { provide: ConfigService, useValue: mockConfig },
        { provide: CampaignLedgerService, useValue: mockCampaignLedger },
        {
          provide: NotificationOutboxDeliveryService,
          useValue: { enqueueDelivery: jest.fn() },
        },
        {
          provide: AdminNotifyService,
          useValue: { emit: jest.fn().mockResolvedValue(undefined) },
        },
      ],
    }).compile();
    service = module.get<PayoutsService>(PayoutsService);
    prisma = module.get(PrismaService);
    campaignLedger = module.get(CampaignLedgerService);
  });

  describe('approveManualAdjustment', () => {
    it('should throw ForbiddenException when approver is the same as requester', async () => {
      (prisma.payout.findUnique as jest.Mock).mockResolvedValue(mockPayout);
      await expect(
        service.approveManualAdjustment('payout-1', 'user-requester', 'ok'),
      ).rejects.toThrow(ForbiddenException);
      expect(campaignLedger.createManualAdjustment).not.toHaveBeenCalled();
    });

    it('should throw NotFoundException when payout not found', async () => {
      (prisma.payout.findUnique as jest.Mock).mockResolvedValue(null);
      await expect(
        service.approveManualAdjustment('invalid', 'user-approver', 'ok'),
      ).rejects.toThrow(NotFoundException);
    });
  });
});
