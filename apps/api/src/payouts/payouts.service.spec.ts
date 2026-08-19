import { Test, TestingModule } from '@nestjs/testing';
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { PayoutsService } from './payouts.service';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../prisma/prisma.service';
import { ConfigService } from '@nestjs/config';
import { CampaignLedgerService } from './campaign-ledger.service';
import { PayoutStatus } from '../generated/prisma/enums';
import { Prisma } from '../generated/prisma/client';
import { ObservabilityService } from '../observability/observability.service';
import { NotificationOutboxDeliveryService } from '../mail/notification-outbox-delivery.service';
import { AdminNotifyService } from '../admin-notifications/admin-notify.service';

describe('PayoutsService', () => {
  let service: PayoutsService;
  let prisma: jest.Mocked<PrismaService>;
  let campaignLedger: jest.Mocked<CampaignLedgerService>;
  let observability: {
    startSpan: jest.Mock;
    recordPayout: jest.Mock;
    recordPayoutTransferEvent: jest.Mock;
  };
  let audit: { log: jest.Mock };
  let delivery: { enqueueDelivery: jest.Mock };
  let adminNotify: { emit: jest.Mock };

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

  const tx = {
    payout: {
      findUniqueOrThrow: jest.fn(),
      updateMany: jest.fn(),
      findMany: jest.fn(),
    },
    payoutProviderEventClaim: { create: jest.fn().mockResolvedValue({}) },
    payoutRun: { update: jest.fn().mockResolvedValue({}) },
    $executeRaw: jest.fn().mockResolvedValue(0),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    const mockPrisma = {
      payout: {
        findUnique: jest.fn(),
        findUniqueOrThrow: jest.fn(),
        findMany: jest.fn(),
        update: jest.fn(),
      },
      campaign: { findUnique: jest.fn() },
      notificationOutbox: {
        create: jest.fn().mockResolvedValue({ id: 'outbox-1' }),
      },
      $transaction: jest.fn(
        async (fn: (client: typeof tx) => Promise<unknown>) => fn(tx),
      ),
    };
    const mockCampaignLedger = {
      createManualAdjustment: jest.fn().mockResolvedValue(undefined),
      createPayoutSucceeded: jest.fn().mockResolvedValue(undefined),
      createPayoutFailed: jest.fn().mockResolvedValue(undefined),
    };
    observability = {
      startSpan: jest.fn(
        async (
          _name: string,
          _attributes: Record<string, unknown>,
          callback: () => Promise<unknown>,
        ) => callback(),
      ),
      recordPayout: jest.fn(),
      recordPayoutTransferEvent: jest.fn(),
    };
    audit = { log: jest.fn().mockResolvedValue(undefined) };
    delivery = { enqueueDelivery: jest.fn().mockResolvedValue(undefined) };
    adminNotify = { emit: jest.fn().mockResolvedValue(undefined) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PayoutsService,
        { provide: AuditService, useValue: audit },
        { provide: ObservabilityService, useValue: observability },
        { provide: PrismaService, useValue: mockPrisma },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string) =>
              key === 'PAYSTACK_SECRET_KEY' ? 'sk_test' : undefined,
            ),
          },
        },
        { provide: CampaignLedgerService, useValue: mockCampaignLedger },
        {
          provide: NotificationOutboxDeliveryService,
          useValue: delivery,
        },
        { provide: AdminNotifyService, useValue: adminNotify },
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

  describe('applyTransferWebhookEvent', () => {
    const initiated = {
      id: 'payout-1',
      campaignId: 'campaign-1',
      providerRef: 'trf_1',
      provider: 'PAYSTACK',
      status: PayoutStatus.INITIATED,
      amount: 1000,
      currency: 'NGN',
      payoutRunId: null,
      failureReason: null,
      recipient: { id: 'u1', email: 'org@example.com', firstName: 'Org' },
      campaign: { id: 'campaign-1', title: 'Camp' },
    };

    it('returns false when no payout matches reference', async () => {
      (prisma.payout.findMany as jest.Mock).mockResolvedValue([]);
      await expect(
        service.applyTransferWebhookEvent('transfer.failed', 'missing'),
      ).resolves.toBe(false);
    });

    it('applies failure release and notifies organizer', async () => {
      (prisma.payout.findMany as jest.Mock).mockResolvedValue([initiated]);
      tx.payout.findUniqueOrThrow.mockResolvedValue({
        status: PayoutStatus.INITIATED,
      });
      tx.payout.updateMany.mockResolvedValue({ count: 1 });

      await expect(
        service.applyTransferWebhookEvent('transfer.failed', 'trf_1', {
          event: 'transfer.failed',
        }),
      ).resolves.toBe(true);

      expect(campaignLedger.createPayoutFailed).toHaveBeenCalled();
      expect(tx.payoutProviderEventClaim.create).toHaveBeenCalled();
      expect(observability.recordPayoutTransferEvent).toHaveBeenCalledWith(
        'applied',
      );
      expect(delivery.enqueueDelivery).toHaveBeenCalledWith('outbox-1');
      expect(adminNotify.emit).toHaveBeenCalled();
    });

    it('applies success ledger without release', async () => {
      (prisma.payout.findMany as jest.Mock).mockResolvedValue([initiated]);
      tx.payout.findUniqueOrThrow.mockResolvedValue({
        status: PayoutStatus.INITIATED,
      });
      tx.payout.updateMany.mockResolvedValue({ count: 1 });

      await service.applyTransferWebhookEvent('transfer.success', 'trf_1');

      expect(campaignLedger.createPayoutSucceeded).toHaveBeenCalled();
      expect(campaignLedger.createPayoutFailed).not.toHaveBeenCalled();
      expect(observability.recordPayoutTransferEvent).toHaveBeenCalledWith(
        'applied',
      );
    });

    it('marks stale when FAILED arrives after SUCCEEDED', async () => {
      (prisma.payout.findMany as jest.Mock).mockResolvedValue([
        { ...initiated, status: PayoutStatus.SUCCEEDED },
      ]);
      tx.payout.findUniqueOrThrow.mockResolvedValue({
        status: PayoutStatus.SUCCEEDED,
      });
      (prisma.payout.findUniqueOrThrow as jest.Mock).mockResolvedValue({
        status: PayoutStatus.SUCCEEDED,
      });

      await service.applyTransferWebhookEvent('transfer.failed', 'trf_1');

      expect(tx.payout.updateMany).not.toHaveBeenCalled();
      expect(observability.recordPayoutTransferEvent).toHaveBeenCalledWith(
        'stale',
      );
    });

    it('marks duplicate when already at target status', async () => {
      (prisma.payout.findMany as jest.Mock).mockResolvedValue([
        { ...initiated, status: PayoutStatus.FAILED },
      ]);
      tx.payout.findUniqueOrThrow.mockResolvedValue({
        status: PayoutStatus.FAILED,
      });
      (prisma.payout.findUniqueOrThrow as jest.Mock).mockResolvedValue({
        status: PayoutStatus.FAILED,
      });

      await service.applyTransferWebhookEvent('transfer.failed', 'trf_1');

      expect(observability.recordPayoutTransferEvent).toHaveBeenCalledWith(
        'duplicate',
      );
    });

    it('treats unique conflicts as duplicate no-ops', async () => {
      (prisma.payout.findMany as jest.Mock).mockResolvedValue([initiated]);
      (prisma.$transaction as jest.Mock).mockRejectedValue(
        new Prisma.PrismaClientKnownRequestError('Unique', {
          code: 'P2002',
          clientVersion: 'test',
        }),
      );

      await service.applyTransferWebhookEvent('transfer.failed', 'trf_1');

      expect(observability.recordPayoutTransferEvent).toHaveBeenCalledWith(
        'duplicate',
      );
    });

    it('completes payout run when all members are terminal', async () => {
      (prisma.payout.findMany as jest.Mock).mockResolvedValue([
        { ...initiated, payoutRunId: 'run-1' },
      ]);
      tx.payout.findUniqueOrThrow.mockResolvedValue({
        status: PayoutStatus.INITIATED,
      });
      tx.payout.updateMany.mockResolvedValue({ count: 1 });
      tx.payout.findMany.mockResolvedValue([
        { status: PayoutStatus.SUCCEEDED },
      ]);

      await service.applyTransferWebhookEvent('transfer.success', 'trf_1');

      expect(tx.$executeRaw).toHaveBeenCalled();
      expect(tx.payoutRun.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'run-1' },
          data: expect.objectContaining({ status: 'COMPLETED' }),
        }),
      );
    });

    it('retries CAS and applies reverse after concurrent success', async () => {
      (prisma.payout.findMany as jest.Mock).mockResolvedValue([initiated]);
      tx.payout.findUniqueOrThrow
        .mockResolvedValueOnce({ status: PayoutStatus.INITIATED })
        .mockResolvedValueOnce({ status: PayoutStatus.SUCCEEDED });
      tx.payout.updateMany
        .mockResolvedValueOnce({ count: 0 })
        .mockResolvedValueOnce({ count: 1 });

      await service.applyTransferWebhookEvent('transfer.reversed', 'trf_1');

      expect(tx.payout.updateMany).toHaveBeenCalledTimes(2);
      expect(campaignLedger.createPayoutFailed).toHaveBeenCalled();
      expect(observability.recordPayoutTransferEvent).toHaveBeenCalledWith(
        'applied',
      );
    });

    it('updatePayoutStatusByReference delegates to applyTransferWebhookEvent', async () => {
      (prisma.payout.findMany as jest.Mock)
        .mockResolvedValueOnce([initiated])
        .mockResolvedValueOnce([initiated]);
      tx.payout.findUniqueOrThrow.mockResolvedValue({
        status: PayoutStatus.INITIATED,
      });
      tx.payout.updateMany.mockResolvedValue({ count: 1 });

      const result = await service.updatePayoutStatusByReference(
        'trf_1',
        PayoutStatus.SUCCEEDED,
      );
      expect(result).toEqual([
        expect.objectContaining({ id: 'payout-1', campaignId: 'campaign-1' }),
      ]);
    });
  });
});
