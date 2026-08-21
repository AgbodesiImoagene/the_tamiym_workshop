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
import { RefundReasonCode } from './resolution-policy';
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
    shipment: { findFirst: jest.Mock };
    payment: { findFirst: jest.Mock };
    refund: {
      create: jest.Mock;
      update: jest.Mock;
      updateMany: jest.Mock;
      findUnique: jest.Mock;
      findUniqueOrThrow: jest.Mock;
      findFirst: jest.Mock;
      findMany: jest.Mock;
    };
    refundSettlementClaim: { create: jest.Mock; findUnique: jest.Mock };
    notificationOutbox: { create: jest.Mock };
    campaign: { update: jest.Mock };
    $transaction: jest.Mock;
    $executeRaw: jest.Mock;
  };
  let paystackRefundClient: { createRefund: jest.Mock };
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
      shipment: { findFirst: jest.fn() },
      payment: { findFirst: jest.fn() },
      refund: {
        create: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        findUnique: jest.fn(),
        findUniqueOrThrow: jest.fn(),
        findFirst: jest.fn(),
        findMany: jest.fn(),
      },
      refundSettlementClaim: {
        create: jest.fn(),
        findUnique: jest.fn(),
      },
      notificationOutbox: { create: jest.fn() },
      campaign: { update: jest.fn() },
      $transaction: jest.fn(),
      $executeRaw: jest.fn(),
    };
    prisma.refund.findMany.mockResolvedValue([]);
    prisma.order.findUnique.mockResolvedValue({
      status: OrderStatus.PAID,
      items: [{ designId: null }],
    });
    prisma.shipment.findFirst.mockResolvedValue(null);

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

  function mockReserveSuccess(initiated: Record<string, unknown>) {
    let calls = 0;
    prisma.$transaction.mockImplementation(
      async (cb: (tx: Record<string, unknown>) => Promise<unknown>) => {
        calls += 1;
        if (calls === 1) {
          const tx = {
            $executeRaw: jest.fn().mockResolvedValue(undefined),
            order: {
              findUnique: jest.fn().mockResolvedValue({
                ...mockOrder,
                items: [{ designId: null }],
              }),
            },
            shipment: { findFirst: jest.fn().mockResolvedValue(null) },
            payment: { findFirst: jest.fn().mockResolvedValue(mockPayment) },
            refund: {
              findMany: jest.fn().mockResolvedValue([]),
              create: jest.fn().mockResolvedValue(initiated),
              findUnique: jest.fn(),
            },
          };
          return cb(tx);
        }
        // Drive claim transaction
        const row = {
          ...initiated,
          payment: mockPayment,
          updatedAt: new Date(),
          providerRef: null,
        };
        const tx = {
          $executeRaw: jest.fn().mockResolvedValue(undefined),
          refund: {
            findUniqueOrThrow: jest.fn().mockResolvedValue(row),
            update: jest.fn().mockResolvedValue({
              ...row,
              providerRef: `driving:${String(initiated.id)}`,
            }),
          },
        };
        return cb(tx);
      },
    );
  }

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('initiateRefund', () => {
    it('rejects when order is missing during policy check', async () => {
      prisma.order.findUnique.mockResolvedValue(null);

      await expect(
        service.initiateRefund(
          'missing-order',
          1000,
          RefundReasonCode.ADMIN_GOODWILL,
        ),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('rejects ineligible reason with stable TTW-041 code before reserving', async () => {
      prisma.order.findUnique.mockResolvedValue({
        status: OrderStatus.FULFILLED,
        items: [{ designId: 'design-1' }],
      });

      await expect(
        service.initiateRefund(
          'order-1',
          1000,
          RefundReasonCode.CHANGE_OF_MIND,
        ),
      ).rejects.toMatchObject({
        response: {
          code: 'REFUND_NOT_ALLOWED_CUSTOM_CHANGE_OF_MIND',
        },
      });
      expect(prisma.$transaction).not.toHaveBeenCalled();
      expect(paystackRefundClient.createRefund).not.toHaveBeenCalled();
    });

    it('reserves then moves to PROCESSING without settling money', async () => {
      const initiated = {
        id: 'refund-1',
        orderId: 'order-1',
        status: RefundStatus.INITIATED,
        amount: 5000,
        providerRef: null,
        transactionReference: 'txn_123',
        payment: mockPayment,
      };
      mockReserveSuccess(initiated);
      prisma.refund.findUniqueOrThrow.mockResolvedValue({
        ...initiated,
        status: RefundStatus.PROCESSING,
        providerRef: '991',
      });
      prisma.refund.updateMany.mockResolvedValue({ count: 1 });

      const result = await service.initiateRefund(
        'order-1',
        5000,
        RefundReasonCode.ADMIN_GOODWILL,
        'partial',
        'admin-1',
      );

      expect(paystackRefundClient.createRefund).toHaveBeenCalled();
      expect(result.status).toBe(RefundStatus.PROCESSING);
      expect(campaignLedger.createRefundApplied).not.toHaveBeenCalled();
      expect(observability.recordRefundSettlement).toHaveBeenCalledWith(
        'initiated',
      );
    });

    it('rejects when amount exceeds remaining captured value', async () => {
      prisma.$transaction.mockImplementation(
        async (cb: (tx: Record<string, unknown>) => Promise<unknown>) => {
          const tx = {
            $executeRaw: jest.fn().mockResolvedValue(undefined),
            order: {
              findUnique: jest.fn().mockResolvedValue({
                ...mockOrder,
                items: [{ designId: null }],
              }),
            },
            shipment: { findFirst: jest.fn().mockResolvedValue(null) },
            payment: { findFirst: jest.fn().mockResolvedValue(mockPayment) },
            refund: {
              findMany: jest
                .fn()
                .mockResolvedValue([{ amount: 8000, status: 'SUCCEEDED' }]),
              create: jest.fn(),
              findUnique: jest.fn(),
            },
          };
          return cb(tx);
        },
      );

      await expect(
        service.initiateRefund(
          'order-1',
          3000,
          RefundReasonCode.ADMIN_GOODWILL,
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(paystackRefundClient.createRefund).not.toHaveBeenCalled();
    });

    it('reuses terminal/in-flight refund for same idempotency key', async () => {
      const existing = {
        id: 'refund-existing',
        orderId: 'order-1',
        status: RefundStatus.PROCESSING,
        amount: 1000,
        providerRef: '991',
        idempotencyKey: 'idem-1',
      };
      prisma.refund.findUnique.mockResolvedValue(existing);

      const result = await service.initiateRefund(
        'order-1',
        1000,
        RefundReasonCode.ADMIN_GOODWILL,
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

    it('re-drives provider for stuck INITIATED without providerRef', async () => {
      const existing = {
        id: 'refund-stuck',
        orderId: 'order-1',
        status: RefundStatus.INITIATED,
        amount: 1000,
        providerRef: null,
        transactionReference: 'txn_123',
        idempotencyKey: 'idem-stuck',
        payment: mockPayment,
        updatedAt: new Date(),
      };
      prisma.refund.findUnique.mockResolvedValue(existing);
      prisma.$transaction.mockImplementation(
        async (cb: (tx: Record<string, unknown>) => Promise<unknown>) => {
          const tx = {
            $executeRaw: jest.fn().mockResolvedValue(undefined),
            refund: {
              findUniqueOrThrow: jest.fn().mockResolvedValue(existing),
              update: jest.fn().mockResolvedValue({
                ...existing,
                providerRef: 'driving:refund-stuck',
              }),
            },
          };
          return cb(tx);
        },
      );
      prisma.refund.findUniqueOrThrow.mockResolvedValue({
        ...existing,
        status: RefundStatus.PROCESSING,
        providerRef: '991',
      });
      prisma.refund.updateMany.mockResolvedValue({ count: 1 });

      const result = await service.initiateRefund(
        'order-1',
        1000,
        RefundReasonCode.ADMIN_GOODWILL,
        undefined,
        'admin',
        'idem-stuck',
      );
      expect(paystackRefundClient.createRefund).toHaveBeenCalled();
      expect(result.status).toBe(RefundStatus.PROCESSING);
    });

    it('throws NotFound when order is missing under the reservation lock', async () => {
      prisma.$transaction.mockImplementation(
        async (cb: (tx: Record<string, unknown>) => Promise<unknown>) => {
          const tx = {
            $executeRaw: jest.fn().mockResolvedValue(undefined),
            order: { findUnique: jest.fn().mockResolvedValue(null) },
            shipment: { findFirst: jest.fn().mockResolvedValue(null) },
            payment: { findFirst: jest.fn() },
            refund: {
              findMany: jest.fn(),
              create: jest.fn(),
              findUnique: jest.fn(),
            },
          };
          return cb(tx);
        },
      );
      await expect(
        service.initiateRefund('missing', 10, RefundReasonCode.ADMIN_GOODWILL),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('rejects non-refundable order status under the reservation lock', async () => {
      prisma.$transaction.mockImplementation(
        async (cb: (tx: Record<string, unknown>) => Promise<unknown>) => {
          const tx = {
            $executeRaw: jest.fn().mockResolvedValue(undefined),
            order: {
              findUnique: jest.fn().mockResolvedValue({
                ...mockOrder,
                status: OrderStatus.PENDING_PAYMENT,
                items: [{ designId: null }],
              }),
            },
            shipment: { findFirst: jest.fn().mockResolvedValue(null) },
            payment: { findFirst: jest.fn() },
            refund: {
              findMany: jest.fn(),
              create: jest.fn(),
              findUnique: jest.fn(),
            },
          };
          return cb(tx);
        },
      );
      await expect(
        service.initiateRefund('order-1', 10, RefundReasonCode.ADMIN_GOODWILL),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('re-drives reserved INITIATED refund even if live policy would now deny', async () => {
      const existing = {
        id: 'refund-stuck',
        orderId: 'order-1',
        status: RefundStatus.INITIATED,
        amount: 1000,
        providerRef: null,
        transactionReference: 'txn_123',
        idempotencyKey: 'idem-policy-skip',
        payment: mockPayment,
        updatedAt: new Date(),
      };
      // Live order would deny CHANGE_OF_MIND after customization/fulfilment.
      prisma.order.findUnique.mockResolvedValue({
        status: OrderStatus.FULFILLED,
        items: [{ designId: 'design-1' }],
      });
      prisma.refund.findUnique.mockResolvedValue(existing);
      prisma.$transaction.mockImplementation(
        async (cb: (tx: Record<string, unknown>) => Promise<unknown>) => {
          const tx = {
            $executeRaw: jest.fn().mockResolvedValue(undefined),
            refund: {
              findUniqueOrThrow: jest.fn().mockResolvedValue(existing),
              update: jest.fn().mockResolvedValue({
                ...existing,
                providerRef: 'driving:refund-stuck',
              }),
            },
          };
          return cb(tx);
        },
      );
      prisma.refund.findUniqueOrThrow.mockResolvedValue({
        ...existing,
        status: RefundStatus.PROCESSING,
        providerRef: '991',
      });
      prisma.refund.updateMany.mockResolvedValue({ count: 1 });

      const result = await service.initiateRefund(
        'order-1',
        1000,
        RefundReasonCode.CHANGE_OF_MIND,
        undefined,
        'admin',
        'idem-policy-skip',
      );
      expect(paystackRefundClient.createRefund).toHaveBeenCalled();
      expect(result.status).toBe(RefundStatus.PROCESSING);
    });

    it('marks FAILED and rethrows on hard provider rejection', async () => {
      const initiated = {
        id: 'refund-1',
        orderId: 'order-1',
        status: RefundStatus.INITIATED,
        amount: 5000,
        providerRef: null,
        transactionReference: 'txn_123',
        payment: mockPayment,
      };
      mockReserveSuccess(initiated);
      prisma.refund.findUniqueOrThrow.mockResolvedValue(initiated);
      paystackRefundClient.createRefund.mockRejectedValue(
        new BadRequestException('insufficient balance'),
      );

      await expect(
        service.initiateRefund(
          'order-1',
          5000,
          RefundReasonCode.ADMIN_GOODWILL,
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.refund.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: RefundStatus.FAILED }),
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
        providerRef: null,
        transactionReference: 'txn_123',
        payment: mockPayment,
      };
      mockReserveSuccess(initiated);
      prisma.refund.findUniqueOrThrow.mockResolvedValue(initiated);
      paystackRefundClient.createRefund.mockRejectedValue(
        new PaystackRefundTransientError('timeout'),
      );

      await expect(
        service.initiateRefund(
          'order-1',
          5000,
          RefundReasonCode.ADMIN_GOODWILL,
        ),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(observability.recordRefundSettlement).toHaveBeenCalledWith(
        'provider_transient',
      );
    });

    it('rejects amount <= 0', async () => {
      await expect(
        service.initiateRefund('order-1', 0, RefundReasonCode.ADMIN_GOODWILL),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rejects idempotency key on a different order', async () => {
      prisma.refund.findUnique.mockResolvedValue({
        id: 'r1',
        orderId: 'other',
        amount: 10,
        status: RefundStatus.PROCESSING,
        providerRef: '1',
      });
      await expect(
        service.initiateRefund(
          'order-1',
          10,
          RefundReasonCode.ADMIN_GOODWILL,
          undefined,
          'a',
          'k',
        ),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('rejects idempotency key with a different amount', async () => {
      prisma.refund.findUnique.mockResolvedValue({
        id: 'r1',
        orderId: 'order-1',
        amount: 50,
        status: RefundStatus.PROCESSING,
        providerRef: '1',
      });
      await expect(
        service.initiateRefund(
          'order-1',
          10,
          RefundReasonCode.ADMIN_GOODWILL,
          undefined,
          'a',
          'k',
        ),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('settles when provider returns processed synchronously', async () => {
      const initiated = {
        id: 'refund-1',
        orderId: 'order-1',
        status: RefundStatus.INITIATED,
        amount: 5000,
        providerRef: null,
        transactionReference: 'txn_123',
        payment: mockPayment,
        updatedAt: new Date(),
      };
      mockReserveSuccess(initiated);
      paystackRefundClient.createRefund.mockResolvedValue({
        providerRefundId: '991',
        providerStatus: 'processed',
        refundReference: null,
        transactionReference: 'txn_123',
        amountKobo: 500_000,
        currency: 'NGN',
      });
      prisma.refund.updateMany.mockResolvedValue({ count: 1 });
      prisma.refund.findUniqueOrThrow.mockResolvedValue({
        ...initiated,
        status: RefundStatus.SUCCEEDED,
        providerRef: '991',
      });
      prisma.refund.findFirst.mockResolvedValue({
        ...initiated,
        status: RefundStatus.PROCESSING,
        providerRef: '991',
        reason: null,
        provider: 'PAYSTACK',
        settlementClaim: null,
        payment: mockPayment,
        order: mockOrder,
      });

      // After reserve+claim, settle uses another $transaction
      const orig = prisma.$transaction.getMockImplementation()!;
      let calls = 0;
      prisma.$transaction.mockImplementation(
        async (cb: (tx: Record<string, unknown>) => Promise<unknown>) => {
          calls += 1;
          if (calls <= 2) return orig(cb);
          const tx = {
            $executeRaw: jest.fn().mockResolvedValue(undefined),
            refundSettlementClaim: {
              create: jest.fn().mockResolvedValue({}),
            },
            refund: {
              updateMany: jest.fn().mockResolvedValue({ count: 1 }),
              findMany: jest.fn().mockResolvedValue([{ amount: 5000 }]),
              findUnique: jest.fn(),
            },
            order: {
              update: jest.fn().mockResolvedValue({}),
              findUniqueOrThrow: jest.fn().mockResolvedValue(mockOrder),
            },
            campaign: { update: jest.fn() },
            notificationOutbox: {
              create: jest.fn().mockResolvedValue({ id: 'n1' }),
            },
          };
          await cb(tx);
          return undefined;
        },
      );

      const result = await service.initiateRefund(
        'order-1',
        5000,
        RefundReasonCode.ADMIN_GOODWILL,
      );
      expect(result.status).toBe(RefundStatus.SUCCEEDED);
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
            $executeRaw: jest.fn().mockResolvedValue(undefined),
            refundSettlementClaim: {
              create: jest.fn().mockResolvedValue({}),
            },
            refund: {
              updateMany: jest.fn().mockResolvedValue({ count: 1 }),
              findMany: jest.fn().mockResolvedValue([{ amount: 5000 }]),
              findUnique: jest.fn(),
            },
            order: {
              update: jest.fn().mockResolvedValue({}),
              findUniqueOrThrow: jest.fn().mockResolvedValue(mockOrder),
            },
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
      expect(observability.recordRefundSettlement).toHaveBeenCalledWith(
        'settled',
      );
    });

    it('rejects provider/local amount mismatch without settling', async () => {
      prisma.refund.findFirst.mockResolvedValue(baseRefund);
      const ok = await service.applyRefundWebhookEvent({
        event: 'refund.processed',
        data: {
          id: 991,
          status: 'processed',
          amount: 100,
          currency: 'NGN',
        },
      });
      expect(ok).toBe(true);
      expect(prisma.$transaction).not.toHaveBeenCalled();
      expect(observability.recordRefundSettlement).toHaveBeenCalledWith(
        'rejected',
      );
      expect(prisma.refund.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: RefundStatus.NEEDS_ATTENTION,
          }),
        }),
      );
    });

    it('settles refund.processed after prior FAILED (out-of-order)', async () => {
      prisma.refund.findFirst.mockResolvedValue({
        ...baseRefund,
        status: RefundStatus.FAILED,
      });
      prisma.$transaction.mockImplementation(
        async (cb: (tx: Record<string, unknown>) => Promise<unknown>) => {
          const tx = {
            $executeRaw: jest.fn().mockResolvedValue(undefined),
            refundSettlementClaim: {
              create: jest.fn().mockResolvedValue({}),
            },
            refund: {
              updateMany: jest.fn().mockResolvedValue({ count: 1 }),
              findMany: jest.fn().mockResolvedValue([{ amount: 5000 }]),
              findUnique: jest.fn(),
            },
            order: {
              update: jest.fn().mockResolvedValue({}),
              findUniqueOrThrow: jest.fn().mockResolvedValue(mockOrder),
            },
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
        },
      });
      expect(ok).toBe(true);
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
        data: { id: 991, status: 'processed', amount: 500000, currency: 'NGN' },
      });
      expect(ok).toBe(true);
      expect(observability.recordRefundSettlement).toHaveBeenCalledWith(
        'duplicate',
      );
    });

    it('marks FAILED on refund.failed without ledger effects', async () => {
      prisma.refund.findFirst.mockResolvedValue(baseRefund);
      prisma.refund.updateMany.mockResolvedValue({ count: 1 });

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

    it('updates PROCESSING on refund.processing via CAS', async () => {
      prisma.refund.findFirst.mockResolvedValue({
        ...baseRefund,
        status: RefundStatus.INITIATED,
      });
      prisma.refund.updateMany.mockResolvedValue({ count: 1 });

      const ok = await service.applyRefundWebhookEvent({
        event: 'refund.processing',
        data: { id: 991, status: 'processing' },
      });
      expect(ok).toBe(true);
      expect(observability.recordRefundSettlement).toHaveBeenCalledWith(
        'status_updated',
      );
    });

    it('handles P2002 on settlement as duplicate only when claim exists', async () => {
      prisma.refund.findFirst.mockResolvedValue(baseRefund);
      prisma.$transaction.mockRejectedValue(
        new Prisma.PrismaClientKnownRequestError('Unique', {
          code: 'P2002',
          clientVersion: 'test',
        }),
      );
      prisma.refundSettlementClaim.findUnique.mockResolvedValue({
        id: 'claim-1',
      });
      const ok = await service.applyRefundWebhookEvent({
        event: 'refund.processed',
        data: { id: 991, status: 'processed', amount: 500000, currency: 'NGN' },
      });
      expect(ok).toBe(true);
      expect(observability.recordRefundSettlement).toHaveBeenCalledWith(
        'duplicate',
      );
    });

    it('fails stale INITIATED refunds without providerRef', async () => {
      prisma.refund.updateMany
        .mockResolvedValueOnce({ count: 1 })
        .mockResolvedValueOnce({ count: 2 });
      const count = await service.failStaleInitiatedRefunds();
      expect(count).toBe(3);
      expect(observability.recordRefundSettlement).toHaveBeenCalled();
    });

    it('rejects currency mismatch without settling', async () => {
      prisma.refund.findFirst.mockResolvedValue(baseRefund);
      const ok = await service.applyRefundWebhookEvent({
        event: 'refund.processed',
        data: {
          id: 991,
          status: 'processed',
          amount: 500000,
          currency: 'USD',
        },
      });
      expect(ok).toBe(true);
      expect(observability.recordRefundSettlement).toHaveBeenCalledWith(
        'rejected',
      );
    });

    it('treats refund.failed after SUCCEEDED as stale', async () => {
      prisma.refund.findFirst.mockResolvedValue({
        ...baseRefund,
        status: RefundStatus.SUCCEEDED,
        settlementClaim: { id: 'c' },
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

    it('returns false for unknown refund event names', async () => {
      const ok = await service.applyRefundWebhookEvent({
        event: 'refund.other',
        data: {},
      });
      expect(ok).toBe(false);
    });

    it('returns false when refund.failed cannot be matched', async () => {
      prisma.refund.findFirst.mockResolvedValue(null);
      prisma.refund.findMany.mockResolvedValue([]);
      prisma.order.findUnique.mockResolvedValue({
        status: OrderStatus.PAID,
        items: [{ designId: null }],
      });
      prisma.shipment.findFirst.mockResolvedValue(null);
      const ok = await service.applyRefundWebhookEvent({
        event: 'refund.failed',
        data: { id: 404 },
      });
      expect(ok).toBe(false);
    });
  });
});
