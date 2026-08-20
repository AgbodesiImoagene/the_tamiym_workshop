import { Test, TestingModule } from '@nestjs/testing';
import {
  NotFoundException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { RefundsService } from './refunds.service';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../prisma/prisma.service';
import { CampaignLedgerService } from '../payouts/campaign-ledger.service';
import { OrderStatus, RefundStatus } from '../generated/prisma/enums';
import { Prisma } from '../generated/prisma/client';
import { ObservabilityService } from '../observability/observability.service';
import { NotificationOutboxDeliveryService } from '../mail/notification-outbox-delivery.service';
import { AdminNotifyService } from '../admin-notifications/admin-notify.service';
import {
  PaystackRefundClient,
  PaystackRefundTransientError,
} from './paystack-refund.client';

const mockOrder = {
  id: 'order-1',
  userId: 'user-1',
  status: OrderStatus.PAID,
  totalAmount: 10000,
  currency: 'NGN',
  campaignId: null as string | null,
  user: {
    id: 'user-1',
    email: 'buyer@test.com',
    firstName: 'Buyer',
  },
};

const mockPayment = {
  id: 'pay-1',
  orderId: 'order-1',
  providerRef: 'txn_123',
  status: 'SUCCEEDED',
  amount: 10000,
};

describe('RefundsService', () => {
  let service: RefundsService;
  let prisma: {
    order: { findUnique: jest.Mock };
    payment: { findFirst: jest.Mock };
    refund: {
      create: jest.Mock;
      update: jest.Mock;
      findUnique: jest.Mock;
      findUniqueOrThrow: jest.Mock;
      findFirst: jest.Mock;
      findMany: jest.Mock;
      updateMany: jest.Mock;
    };
    refundSettlementClaim: { create: jest.Mock };
    notificationOutbox: { create: jest.Mock };
    campaign: { update: jest.Mock };
    $transaction: jest.Mock;
  };
  let paystackRefundClient: {
    createRefund: jest.Mock;
  };
  let observability: {
    startSpan: jest.Mock;
    recordRefund: jest.Mock;
    recordRefundSettlement: jest.Mock;
  };
  let campaignLedger: { createRefundApplied: jest.Mock };
  let audit: { log: jest.Mock };
  let adminNotify: { emit: jest.Mock };
  let notificationOutboxDelivery: { enqueueDelivery: jest.Mock };

  beforeEach(async () => {
    prisma = {
      order: { findUnique: jest.fn() },
      payment: { findFirst: jest.fn() },
      refund: {
        create: jest.fn(),
        update: jest.fn(),
        findUnique: jest.fn(),
        findUniqueOrThrow: jest.fn(),
        findFirst: jest.fn(),
        findMany: jest.fn(),
        updateMany: jest.fn(),
      },
      refundSettlementClaim: { create: jest.fn() },
      notificationOutbox: { create: jest.fn() },
      campaign: { update: jest.fn() },
      $transaction: jest.fn(),
    };

    paystackRefundClient = {
      createRefund: jest.fn().mockResolvedValue({
        providerRefundId: '991',
        providerStatus: 'pending',
        refundReference: null,
        transactionReference: 'txn_123',
        amountKobo: 500_000,
        currency: 'NGN',
      }),
    };

    observability = {
      startSpan: jest.fn(
        async (
          _name: string,
          _attrs: Record<string, unknown>,
          cb: () => Promise<unknown>,
        ) => cb(),
      ),
      recordRefund: jest.fn(),
      recordRefundSettlement: jest.fn(),
    };
    campaignLedger = {
      createRefundApplied: jest.fn().mockResolvedValue(undefined),
    };
    audit = { log: jest.fn().mockResolvedValue(undefined) };
    adminNotify = { emit: jest.fn().mockResolvedValue(undefined) };
    notificationOutboxDelivery = {
      enqueueDelivery: jest.fn().mockResolvedValue(undefined),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RefundsService,
        { provide: PrismaService, useValue: prisma },
        { provide: CampaignLedgerService, useValue: campaignLedger },
        { provide: AuditService, useValue: audit },
        { provide: ObservabilityService, useValue: observability },
        {
          provide: NotificationOutboxDeliveryService,
          useValue: notificationOutboxDelivery,
        },
        { provide: AdminNotifyService, useValue: adminNotify },
        { provide: PaystackRefundClient, useValue: paystackRefundClient },
      ],
    }).compile();

    service = module.get(RefundsService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('initiateRefund', () => {
    it('reserves INITIATED then moves to PROCESSING without settling money', async () => {
      const initiated = {
        id: 'refund-1',
        orderId: 'order-1',
        status: RefundStatus.INITIATED,
        amount: 5000,
        providerRef: null,
      };
      const processing = {
        ...initiated,
        status: RefundStatus.PROCESSING,
        providerRef: '991',
      };

      prisma.$transaction.mockImplementation(
        async (cb: (tx: typeof prisma) => Promise<unknown>) => {
          const tx = {
            order: {
              findUnique: jest.fn().mockResolvedValue(mockOrder),
            },
            payment: {
              findFirst: jest.fn().mockResolvedValue(mockPayment),
            },
            refund: {
              findMany: jest.fn().mockResolvedValue([]),
              create: jest.fn().mockResolvedValue(initiated),
              findUnique: jest.fn(),
            },
          };
          return cb(tx as unknown as typeof prisma);
        },
      );
      prisma.refund.update.mockResolvedValue(processing);

      const result = await service.initiateRefund(
        'order-1',
        5000,
        'partial',
        'admin-1',
      );

      expect(paystackRefundClient.createRefund).toHaveBeenCalled();
      expect(result.status).toBe(RefundStatus.PROCESSING);
      expect(campaignLedger.createRefundApplied).not.toHaveBeenCalled();
      expect(adminNotify.emit).not.toHaveBeenCalled();
      expect(observability.recordRefundSettlement).toHaveBeenCalledWith(
        'initiated',
      );
    });

    it('rejects when amount exceeds remaining captured value', async () => {
      prisma.$transaction.mockImplementation(
        async (cb: (tx: typeof prisma) => Promise<unknown>) => {
          const tx = {
            order: {
              findUnique: jest.fn().mockResolvedValue(mockOrder),
            },
            payment: {
              findFirst: jest.fn().mockResolvedValue(mockPayment),
            },
            refund: {
              findMany: jest
                .fn()
                .mockResolvedValue([{ amount: 8000, status: 'SUCCEEDED' }]),
              create: jest.fn(),
            },
          };
          return cb(tx as unknown as typeof prisma);
        },
      );

      await expect(
        service.initiateRefund('order-1', 3000),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(paystackRefundClient.createRefund).not.toHaveBeenCalled();
    });

    it('reuses an existing refund for the same idempotency key', async () => {
      const existing = {
        id: 'refund-existing',
        orderId: 'order-1',
        status: RefundStatus.PROCESSING,
        amount: 1000,
        idempotencyKey: 'idem-1',
      };
      prisma.refund.findUnique.mockResolvedValue(existing);

      const result = await service.initiateRefund(
        'order-1',
        1000,
        undefined,
        'admin',
        'idem-1',
      );
      expect(result.id).toBe('refund-existing');
      expect(paystackRefundClient.createRefund).not.toHaveBeenCalled();
      expect(observability.recordRefundSettlement).toHaveBeenCalledWith(
        'reused',
      );
    });

    it('throws NotFound when order is missing', async () => {
      prisma.$transaction.mockImplementation(
        async (cb: (tx: typeof prisma) => Promise<unknown>) => {
          const tx = {
            order: { findUnique: jest.fn().mockResolvedValue(null) },
            payment: { findFirst: jest.fn() },
            refund: { findMany: jest.fn(), create: jest.fn() },
          };
          return cb(tx as unknown as typeof prisma);
        },
      );
      await expect(
        service.initiateRefund('missing', 10),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('rejects non-refundable order status', async () => {
      prisma.$transaction.mockImplementation(
        async (cb: (tx: typeof prisma) => Promise<unknown>) => {
          const tx = {
            order: {
              findUnique: jest.fn().mockResolvedValue({
                ...mockOrder,
                status: OrderStatus.PENDING_PAYMENT,
              }),
            },
            payment: { findFirst: jest.fn() },
            refund: { findMany: jest.fn(), create: jest.fn() },
          };
          return cb(tx as unknown as typeof prisma);
        },
      );
      await expect(
        service.initiateRefund('order-1', 10),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('marks FAILED and rethrows on hard provider rejection', async () => {
      const initiated = {
        id: 'refund-1',
        orderId: 'order-1',
        status: RefundStatus.INITIATED,
        amount: 5000,
      };
      prisma.$transaction.mockImplementation(
        async (cb: (tx: typeof prisma) => Promise<unknown>) => {
          const tx = {
            order: {
              findUnique: jest.fn().mockResolvedValue(mockOrder),
            },
            payment: {
              findFirst: jest.fn().mockResolvedValue(mockPayment),
            },
            refund: {
              findMany: jest.fn().mockResolvedValue([]),
              create: jest.fn().mockResolvedValue(initiated),
            },
          };
          return cb(tx as unknown as typeof prisma);
        },
      );
      paystackRefundClient.createRefund.mockRejectedValue(
        new BadRequestException('insufficient balance'),
      );
      prisma.refund.update.mockResolvedValue({
        ...initiated,
        status: RefundStatus.FAILED,
      });

      await expect(
        service.initiateRefund('order-1', 5000),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.refund.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { status: RefundStatus.FAILED },
        }),
      );
      expect(observability.recordRefundSettlement).toHaveBeenCalledWith(
        'provider_rejected',
      );
    });

    it('keeps INITIATED and returns 409 on transient provider failure', async () => {
      const initiated = {
        id: 'refund-1',
        orderId: 'order-1',
        status: RefundStatus.INITIATED,
        amount: 5000,
      };
      prisma.$transaction.mockImplementation(
        async (cb: (tx: typeof prisma) => Promise<unknown>) => {
          const tx = {
            order: {
              findUnique: jest.fn().mockResolvedValue(mockOrder),
            },
            payment: {
              findFirst: jest.fn().mockResolvedValue(mockPayment),
            },
            refund: {
              findMany: jest.fn().mockResolvedValue([]),
              create: jest.fn().mockResolvedValue(initiated),
            },
          };
          return cb(tx as unknown as typeof prisma);
        },
      );
      paystackRefundClient.createRefund.mockRejectedValue(
        new PaystackRefundTransientError('timeout'),
      );

      await expect(
        service.initiateRefund('order-1', 5000),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(observability.recordRefundSettlement).toHaveBeenCalledWith(
        'provider_transient',
      );
    });
  });

  describe('applyRefundWebhookEvent', () => {
    const baseRefund = {
      id: 'refund-1',
      orderId: 'order-1',
      status: RefundStatus.PROCESSING,
      amount: 5000,
      reason: 'partial',
      providerRef: '991',
      transactionReference: 'txn_123',
      provider: 'PAYSTACK',
      settlementClaim: null,
      payment: mockPayment,
      order: { ...mockOrder, campaignId: 'camp-1' },
    };

    it('settles refund.processed exactly once with claim + ledger', async () => {
      prisma.refund.findFirst.mockResolvedValue(baseRefund);
      prisma.$transaction.mockImplementation(
        async (cb: (tx: Record<string, unknown>) => Promise<unknown>) => {
          const tx = {
            refundSettlementClaim: {
              create: jest.fn().mockResolvedValue({}),
            },
            refund: {
              updateMany: jest.fn().mockResolvedValue({ count: 1 }),
              findMany: jest.fn().mockResolvedValue([{ amount: 5000 }]),
            },
            order: { update: jest.fn().mockResolvedValue({}) },
            campaign: { update: jest.fn().mockResolvedValue({}) },
            notificationOutbox: {
              create: jest.fn().mockResolvedValue({ id: 'notif-1' }),
            },
          };
          await cb(tx);
          return undefined;
        },
      );

      const ok = await service.applyRefundWebhookEvent({
        event: 'refund.processed',
        data: {
          id: 991,
          status: 'processed',
          amount: 500000,
          currency: 'NGN',
          transaction_reference: 'txn_123',
        },
      });

      expect(ok).toBe(true);
      expect(campaignLedger.createRefundApplied).toHaveBeenCalled();
      expect(adminNotify.emit).toHaveBeenCalled();
      expect(notificationOutboxDelivery.enqueueDelivery).toHaveBeenCalledWith(
        'notif-1',
      );
      expect(observability.recordRefundSettlement).toHaveBeenCalledWith(
        'settled',
      );
    });

    it('no-ops duplicate refund.processed when claim already exists', async () => {
      prisma.refund.findFirst.mockResolvedValue({
        ...baseRefund,
        settlementClaim: { id: 'claim-1' },
        status: RefundStatus.SUCCEEDED,
      });

      const ok = await service.applyRefundWebhookEvent({
        event: 'refund.processed',
        data: { id: 991, status: 'processed' },
      });
      expect(ok).toBe(true);
      expect(observability.recordRefundSettlement).toHaveBeenCalledWith(
        'duplicate',
      );
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('marks FAILED on refund.failed without ledger effects', async () => {
      prisma.refund.findFirst.mockResolvedValue(baseRefund);
      prisma.refund.update.mockResolvedValue({
        ...baseRefund,
        status: RefundStatus.FAILED,
      });

      const ok = await service.applyRefundWebhookEvent({
        event: 'refund.failed',
        data: { id: 991, status: 'failed' },
      });
      expect(ok).toBe(true);
      expect(campaignLedger.createRefundApplied).not.toHaveBeenCalled();
      expect(observability.recordRefundSettlement).toHaveBeenCalledWith(
        'failed',
      );
    });

    it('updates PROCESSING on refund.processing', async () => {
      prisma.refund.findFirst.mockResolvedValue({
        ...baseRefund,
        status: RefundStatus.INITIATED,
      });
      prisma.refund.update.mockResolvedValue({
        ...baseRefund,
        status: RefundStatus.PROCESSING,
      });

      const ok = await service.applyRefundWebhookEvent({
        event: 'refund.processing',
        data: { id: 991, status: 'processing' },
      });
      expect(ok).toBe(true);
      expect(observability.recordRefundSettlement).toHaveBeenCalledWith(
        'status_updated',
      );
    });

    it('returns false for unmatched refund events', async () => {
      prisma.refund.findFirst.mockResolvedValue(null);
      const ok = await service.applyRefundWebhookEvent({
        event: 'refund.processed',
        data: { id: 404 },
      });
      expect(ok).toBe(false);
      expect(observability.recordRefundSettlement).toHaveBeenCalledWith(
        'unmatched',
      );
    });

    it('rejects amount <= 0', async () => {
      await expect(service.initiateRefund('order-1', 0)).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    it('rejects idempotency key reused on a different order', async () => {
      prisma.refund.findUnique.mockResolvedValue({
        id: 'refund-x',
        orderId: 'other-order',
        status: RefundStatus.PROCESSING,
        amount: 10,
        idempotencyKey: 'shared',
      });
      await expect(
        service.initiateRefund('order-1', 10, undefined, 'admin', 'shared'),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('rejects when no succeeded payment exists', async () => {
      prisma.$transaction.mockImplementation(
        async (cb: (tx: typeof prisma) => Promise<unknown>) => {
          const tx = {
            order: {
              findUnique: jest.fn().mockResolvedValue(mockOrder),
            },
            payment: { findFirst: jest.fn().mockResolvedValue(null) },
            refund: { findMany: jest.fn(), create: jest.fn() },
          };
          return cb(tx as unknown as typeof prisma);
        },
      );
      await expect(
        service.initiateRefund('order-1', 10),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('settles immediately when provider returns processed', async () => {
      const initiated = {
        id: 'refund-1',
        orderId: 'order-1',
        status: RefundStatus.INITIATED,
        amount: 5000,
      };
      prisma.$transaction
        .mockImplementationOnce(
          async (cb: (tx: typeof prisma) => Promise<unknown>) => {
            const tx = {
              order: {
                findUnique: jest.fn().mockResolvedValue(mockOrder),
              },
              payment: {
                findFirst: jest.fn().mockResolvedValue(mockPayment),
              },
              refund: {
                findMany: jest.fn().mockResolvedValue([]),
                create: jest.fn().mockResolvedValue(initiated),
              },
            };
            return cb(tx as unknown as typeof prisma);
          },
        )
        .mockImplementationOnce(
          async (cb: (tx: Record<string, unknown>) => Promise<unknown>) => {
            const tx = {
              refundSettlementClaim: {
                create: jest.fn().mockResolvedValue({}),
              },
              refund: {
                updateMany: jest.fn().mockResolvedValue({ count: 1 }),
                findMany: jest.fn().mockResolvedValue([{ amount: 5000 }]),
              },
              order: { update: jest.fn().mockResolvedValue({}) },
              campaign: { update: jest.fn() },
              notificationOutbox: {
                create: jest.fn().mockResolvedValue({ id: 'n1' }),
              },
            };
            await cb(tx);
            return undefined;
          },
        );

      paystackRefundClient.createRefund.mockResolvedValue({
        providerRefundId: '991',
        providerStatus: 'processed',
        refundReference: null,
        transactionReference: 'txn_123',
        amountKobo: 500_000,
        currency: 'NGN',
      });
      prisma.refund.update.mockResolvedValue({
        ...initiated,
        status: RefundStatus.PROCESSING,
        providerRef: '991',
      });
      prisma.refund.findFirst.mockResolvedValue({
        ...initiated,
        status: RefundStatus.PROCESSING,
        providerRef: '991',
        transactionReference: 'txn_123',
        provider: 'PAYSTACK',
        reason: null,
        settlementClaim: null,
        payment: mockPayment,
        order: mockOrder,
      });
      prisma.refund.findUniqueOrThrow.mockResolvedValue({
        ...initiated,
        status: RefundStatus.SUCCEEDED,
        providerRef: '991',
      });

      const result = await service.initiateRefund('order-1', 5000);
      expect(result.status).toBe(RefundStatus.SUCCEEDED);
      expect(observability.recordRefundSettlement).toHaveBeenCalledWith(
        'settled',
      );
    });

    it('marks NEEDS_ATTENTION on refund.needs-attention', async () => {
      prisma.refund.findFirst.mockResolvedValue({
        id: 'refund-1',
        orderId: 'order-1',
        status: RefundStatus.INITIATED,
        amount: 100,
        providerRef: null,
        transactionReference: 'txn_123',
        settlementClaim: null,
        payment: mockPayment,
        order: mockOrder,
      });
      prisma.refund.update.mockResolvedValue({
        status: RefundStatus.NEEDS_ATTENTION,
      });
      const ok = await service.applyRefundWebhookEvent({
        event: 'refund.needs-attention',
        data: { id: 55, status: 'needs-attention' },
      });
      expect(ok).toBe(true);
      expect(prisma.refund.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: RefundStatus.NEEDS_ATTENTION,
          }),
        }),
      );
    });

    it('treats refund.failed after SUCCEEDED as stale', async () => {
      prisma.refund.findFirst.mockResolvedValue({
        id: 'refund-1',
        status: RefundStatus.SUCCEEDED,
        amount: 100,
        providerRef: '991',
        settlementClaim: { id: 'c1' },
        payment: mockPayment,
        order: mockOrder,
      });
      const ok = await service.applyRefundWebhookEvent({
        event: 'refund.failed',
        data: { id: 991, status: 'failed' },
      });
      expect(ok).toBe(true);
      expect(observability.recordRefundSettlement).toHaveBeenCalledWith(
        'stale',
      );
    });

    it('treats duplicate refund.failed as duplicate', async () => {
      prisma.refund.findFirst.mockResolvedValue({
        id: 'refund-1',
        status: RefundStatus.FAILED,
        amount: 100,
        providerRef: '991',
        settlementClaim: null,
        payment: mockPayment,
        order: mockOrder,
      });
      const ok = await service.applyRefundWebhookEvent({
        event: 'refund.failed',
        data: { id: 991, status: 'failed' },
      });
      expect(ok).toBe(true);
      expect(observability.recordRefundSettlement).toHaveBeenCalledWith(
        'duplicate',
      );
    });

    it('returns false for unmatched refund.failed', async () => {
      prisma.refund.findFirst.mockResolvedValue(null);
      const ok = await service.applyRefundWebhookEvent({
        event: 'refund.failed',
        data: { id: 404 },
      });
      expect(ok).toBe(false);
    });

    it('ignores stale status updates on terminal refunds', async () => {
      prisma.refund.findFirst.mockResolvedValue({
        id: 'refund-1',
        status: RefundStatus.SUCCEEDED,
        amount: 100,
        providerRef: '991',
        settlementClaim: { id: 'c' },
        payment: mockPayment,
        order: mockOrder,
      });
      const ok = await service.applyRefundWebhookEvent({
        event: 'refund.processing',
        data: { id: 991 },
      });
      expect(ok).toBe(true);
      expect(observability.recordRefundSettlement).toHaveBeenCalledWith(
        'stale',
      );
    });

    it('handles P2002 on settlement as duplicate', async () => {
      prisma.refund.findFirst.mockResolvedValue({
        id: 'refund-1',
        orderId: 'order-1',
        status: RefundStatus.PROCESSING,
        amount: 5000,
        reason: null,
        providerRef: '991',
        transactionReference: 'txn_123',
        provider: 'PAYSTACK',
        settlementClaim: null,
        payment: mockPayment,
        order: mockOrder,
      });
      prisma.$transaction.mockRejectedValue(
        new Prisma.PrismaClientKnownRequestError('Unique', {
          code: 'P2002',
          clientVersion: 'test',
        }),
      );
      const ok = await service.applyRefundWebhookEvent({
        event: 'refund.processed',
        data: { id: 991, status: 'processed' },
      });
      expect(ok).toBe(true);
      expect(observability.recordRefundSettlement).toHaveBeenCalledWith(
        'duplicate',
      );
    });

    it('records failed when provider returns failed status', async () => {
      const initiated = {
        id: 'refund-1',
        orderId: 'order-1',
        status: RefundStatus.INITIATED,
        amount: 5000,
      };
      prisma.$transaction.mockImplementation(
        async (cb: (tx: typeof prisma) => Promise<unknown>) => {
          const tx = {
            order: {
              findUnique: jest.fn().mockResolvedValue(mockOrder),
            },
            payment: {
              findFirst: jest.fn().mockResolvedValue(mockPayment),
            },
            refund: {
              findMany: jest.fn().mockResolvedValue([]),
              create: jest.fn().mockResolvedValue(initiated),
            },
          };
          return cb(tx as unknown as typeof prisma);
        },
      );
      paystackRefundClient.createRefund.mockResolvedValue({
        providerRefundId: '991',
        providerStatus: 'failed',
        refundReference: null,
        transactionReference: 'txn_123',
        amountKobo: 500_000,
        currency: 'NGN',
      });
      prisma.refund.update.mockResolvedValue({
        ...initiated,
        status: RefundStatus.FAILED,
        providerRef: '991',
      });
      const result = await service.initiateRefund('order-1', 5000);
      expect(result.status).toBe(RefundStatus.FAILED);
      expect(observability.recordRefundSettlement).toHaveBeenCalledWith(
        'failed',
      );
    });
  });
});
