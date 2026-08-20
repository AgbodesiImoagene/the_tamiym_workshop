import { Test, TestingModule } from '@nestjs/testing';
import { UnauthorizedException } from '@nestjs/common';
import { PaystackWebhookService } from './paystack-webhook.service';
import { PrismaService } from '../prisma/prisma.service';
import { ConfigService } from '@nestjs/config';
import { PayoutsService } from '../payouts/payouts.service';
import { CampaignLedgerService } from '../payouts/campaign-ledger.service';
import { AuditService } from '../audit/audit.service';
import { PaymentStatus, OrderStatus } from '../generated/prisma/enums';
import { Prisma } from '../generated/prisma/client';
import * as crypto from 'node:crypto';
import { ObservabilityService } from '../observability/observability.service';
import { NotificationOutboxDeliveryService } from '../mail/notification-outbox-delivery.service';
import { AdminNotifyService } from '../admin-notifications/admin-notify.service';
import { RefundsService } from './refunds.service';

describe('PaystackWebhookService', () => {
  let service: PaystackWebhookService;
  let prisma: jest.Mocked<PrismaService>;
  let config: ConfigService;
  let observability: {
    recordChargeSettlement: jest.Mock;
    recordWebhook: jest.Mock;
    startSpan: jest.Mock;
  };

  const secret = 'sk_test_secret';
  const rawBody = JSON.stringify({
    event: 'charge.success',
    data: { reference: 'ref-123' },
  });

  const mockTx = {
    chargeSettlementClaim: { create: jest.fn().mockResolvedValue({}) },
    payment: { update: jest.fn().mockResolvedValue({}) },
    order: {
      update: jest.fn().mockResolvedValue({}),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    campaign: { update: jest.fn().mockResolvedValue({}) },
    campaignBalanceLedgerEntry: { create: jest.fn().mockResolvedValue({}) },
    notificationOutbox: {
      create: jest.fn().mockResolvedValue({ id: 'outbox-pay-1' }),
    },
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    mockTx.chargeSettlementClaim.create.mockResolvedValue({});
    mockTx.order.updateMany.mockResolvedValue({ count: 1 });

    const mockPrisma = {
      payment: { findFirst: jest.fn(), update: jest.fn() },
      order: { findFirst: jest.fn(), update: jest.fn() },
      notificationOutbox: {
        create: jest.fn().mockResolvedValue({ id: 'outbox-pay-1' }),
      },
      $transaction: jest.fn((fn: (tx: typeof mockTx) => Promise<unknown>) =>
        fn(mockTx),
      ),
    };

    const mockConfig = {
      get: jest.fn((key: string) =>
        key === 'PAYSTACK_SECRET_KEY' ? secret : undefined,
      ),
    };

    const mockPayoutsService = {
      updatePayoutStatusByReference: jest.fn().mockResolvedValue(undefined),
    };

    const mockCampaignLedger = {
      getSettlementHoldDays: jest.fn().mockResolvedValue(7),
      createPaymentSettled: jest.fn().mockResolvedValue(undefined),
    };
    const mockAudit = {
      log: jest.fn().mockResolvedValue(undefined),
    };
    observability = {
      startSpan: jest.fn(
        async (
          _name: string,
          _attributes: Record<string, unknown>,
          callback: () => Promise<unknown>,
        ) => callback(),
      ),
      recordWebhook: jest.fn(),
      recordChargeSettlement: jest.fn(),
    };

    const mockNotificationOutboxDelivery = {
      enqueueDelivery: jest.fn().mockResolvedValue(undefined),
    };

    const mockAdminNotify = {
      emit: jest.fn().mockResolvedValue(undefined),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PaystackWebhookService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: ConfigService, useValue: mockConfig },
        { provide: PayoutsService, useValue: mockPayoutsService },
        { provide: CampaignLedgerService, useValue: mockCampaignLedger },
        { provide: AuditService, useValue: mockAudit },
        { provide: ObservabilityService, useValue: observability },
        {
          provide: NotificationOutboxDeliveryService,
          useValue: mockNotificationOutboxDelivery,
        },
        { provide: AdminNotifyService, useValue: mockAdminNotify },
        {
          provide: RefundsService,
          useValue: {
            applyRefundWebhookEvent: jest.fn().mockResolvedValue(true),
          },
        },
      ],
    }).compile();

    service = module.get<PaystackWebhookService>(PaystackWebhookService);
    prisma = module.get(PrismaService);
    config = module.get(ConfigService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('verifySignature', () => {
    it('should return true for valid signature', () => {
      const signature = crypto
        .createHmac('sha512', secret)
        .update(rawBody)
        .digest('hex');
      expect(service.verifySignature(rawBody, signature)).toBe(true);
    });

    it('should return false for invalid signature', () => {
      expect(service.verifySignature(rawBody, 'invalid')).toBe(false);
    });

    it('should return false when secret is not set', () => {
      (config.get as jest.Mock).mockReturnValue(undefined);
      const signature = crypto
        .createHmac('sha512', secret)
        .update(rawBody)
        .digest('hex');
      const mockPayouts = { updatePayoutStatusByReference: jest.fn() };
      const mockLedger = {
        getSettlementHoldDays: jest.fn(),
        createPaymentSettled: jest.fn(),
      };
      const mockAudit = { log: jest.fn() };
      const mockObservability = {
        startSpan: jest.fn(
          async (
            _name: string,
            _attributes: Record<string, unknown>,
            callback: () => Promise<unknown>,
          ) => callback(),
        ),
        recordWebhook: jest.fn(),
        recordChargeSettlement: jest.fn(),
      };
      const mockDelivery = {
        enqueueDelivery: jest.fn(),
      };
      const mockAdminNotify = { emit: jest.fn() };
      const mockRefunds = { applyRefundWebhookEvent: jest.fn() };
      const svc = new PaystackWebhookService(
        prisma,
        config,
        mockPayouts as never,
        mockLedger as never,
        mockAudit as never,
        mockObservability as never,
        mockDelivery as never,
        mockAdminNotify as never,
        mockRefunds as never,
      );
      expect(svc.verifySignature(rawBody, signature)).toBe(false);
    });
  });

  describe('processChargeSuccess', () => {
    it('should be idempotent: skip when payment already SUCCEEDED', async () => {
      (prisma.payment.findFirst as jest.Mock).mockResolvedValue({
        id: 'pay-1',
        providerRef: 'ref-123',
        status: PaymentStatus.SUCCEEDED,
        settlementClaim: { id: 'claim-1' },
        order: { id: 'order-1', status: OrderStatus.PENDING_PAYMENT },
      });

      await service.processChargeSuccess({
        event: 'charge.success',
        data: { reference: 'ref-123' },
      });

      expect(prisma.$transaction).not.toHaveBeenCalled();
      expect(observability.recordChargeSettlement).toHaveBeenCalledWith(
        'duplicate',
      );
    });

    it('should skip when payment not found for reference', async () => {
      (prisma.payment.findFirst as jest.Mock).mockResolvedValue(null);

      await service.processChargeSuccess({
        event: 'charge.success',
        data: { reference: 'ref-123' },
      });

      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('should skip when order already PAID', async () => {
      (prisma.payment.findFirst as jest.Mock).mockResolvedValue({
        id: 'pay-1',
        providerRef: 'ref-123',
        status: PaymentStatus.INITIATED,
        settlementClaim: null,
        order: { id: 'order-1', status: OrderStatus.PAID },
      });

      await service.processChargeSuccess({
        event: 'charge.success',
        data: { reference: 'ref-123' },
      });

      expect(prisma.$transaction).not.toHaveBeenCalled();
      expect(observability.recordChargeSettlement).toHaveBeenCalledWith(
        'duplicate',
      );
    });

    it('should skip when order is CANCELLED', async () => {
      (prisma.payment.findFirst as jest.Mock).mockResolvedValue({
        id: 'pay-1',
        providerRef: 'ref-123',
        status: PaymentStatus.INITIATED,
        settlementClaim: null,
        order: { id: 'order-1', status: OrderStatus.CANCELLED },
      });

      await service.processChargeSuccess({
        event: 'charge.success',
        data: { reference: 'ref-123' },
      });

      expect(prisma.$transaction).not.toHaveBeenCalled();
      expect(observability.recordChargeSettlement).toHaveBeenCalledWith(
        'rejected',
      );
    });

    it('should reject expired orders', async () => {
      (prisma.payment.findFirst as jest.Mock).mockResolvedValue({
        id: 'pay-1',
        providerRef: 'ref-123',
        status: PaymentStatus.INITIATED,
        settlementClaim: null,
        order: {
          id: 'order-1',
          status: OrderStatus.PENDING_PAYMENT,
          expiresAt: new Date(Date.now() - 1000),
        },
      });

      await service.processChargeSuccess({
        event: 'charge.success',
        data: { reference: 'ref-123' },
      });

      expect(prisma.$transaction).not.toHaveBeenCalled();
      expect(observability.recordChargeSettlement).toHaveBeenCalledWith(
        'rejected',
      );
    });

    it('should reject amount mismatches', async () => {
      (prisma.payment.findFirst as jest.Mock).mockResolvedValue({
        id: 'pay-1',
        providerRef: 'ref-123',
        status: PaymentStatus.INITIATED,
        settlementClaim: null,
        order: {
          id: 'order-1',
          status: OrderStatus.PENDING_PAYMENT,
          expiresAt: new Date(Date.now() + 3600000),
          currency: 'NGN',
          totalAmount: 100,
        },
      });

      await service.processChargeSuccess({
        event: 'charge.success',
        data: { reference: 'ref-123', amount: 999 },
      });

      expect(prisma.$transaction).not.toHaveBeenCalled();
      expect(observability.recordChargeSettlement).toHaveBeenCalledWith(
        'rejected',
      );
    });

    it('should reject currency mismatches', async () => {
      (prisma.payment.findFirst as jest.Mock).mockResolvedValue({
        id: 'pay-1',
        providerRef: 'ref-123',
        status: PaymentStatus.INITIATED,
        settlementClaim: null,
        order: {
          id: 'order-1',
          status: OrderStatus.PENDING_PAYMENT,
          expiresAt: new Date(Date.now() + 3600000),
          currency: 'NGN',
          totalAmount: 100,
        },
      });

      await service.processChargeSuccess({
        event: 'charge.success',
        data: { reference: 'ref-123', currency: 'USD' },
      });

      expect(prisma.$transaction).not.toHaveBeenCalled();
      expect(observability.recordChargeSettlement).toHaveBeenCalledWith(
        'rejected',
      );
    });

    it('should treat unique claim conflict as duplicate no-op', async () => {
      (prisma.payment.findFirst as jest.Mock).mockResolvedValue({
        id: 'pay-1',
        providerRef: 'ref-123',
        status: PaymentStatus.INITIATED,
        settlementClaim: null,
        provider: 'PAYSTACK',
        order: {
          id: 'order-1',
          status: OrderStatus.PENDING_PAYMENT,
          expiresAt: new Date(Date.now() + 3600000),
          currency: 'NGN',
          totalAmount: 100,
        },
      });
      (prisma.$transaction as jest.Mock).mockRejectedValue(
        new Prisma.PrismaClientKnownRequestError('Unique constraint', {
          code: 'P2002',
          clientVersion: 'test',
        }),
      );

      await service.processChargeSuccess({
        event: 'charge.success',
        data: { reference: 'ref-123' },
      });

      expect(observability.recordChargeSettlement).toHaveBeenCalledWith(
        'duplicate',
      );
    });

    it('should update payment and order when not yet processed', async () => {
      (prisma.payment.findFirst as jest.Mock).mockResolvedValue({
        id: 'pay-1',
        providerRef: 'ref-123',
        status: PaymentStatus.INITIATED,
        settlementClaim: null,
        provider: 'PAYSTACK',
        order: {
          id: 'order-1',
          status: OrderStatus.PENDING_PAYMENT,
          expiresAt: new Date(Date.now() + 3600000),
          currency: 'NGN',
          totalAmount: 100,
        },
      });

      await service.processChargeSuccess({
        event: 'charge.success',
        data: { reference: 'ref-123' },
      });

      expect(prisma.$transaction).toHaveBeenCalled();
      expect(mockTx.chargeSettlementClaim.create).toHaveBeenCalled();
      expect(mockTx.payment.update).toHaveBeenCalledWith({
        where: { id: 'pay-1' },
        data: expect.objectContaining({
          status: PaymentStatus.SUCCEEDED,
        }),
      });
      expect(mockTx.order.updateMany).toHaveBeenCalledWith({
        where: {
          id: 'order-1',
          status: OrderStatus.PENDING_PAYMENT,
        },
        data: {
          status: OrderStatus.PAID,
          paymentStatus: PaymentStatus.SUCCEEDED,
        },
      });
      expect(observability.recordChargeSettlement).toHaveBeenCalledWith(
        'settled',
      );
    });

    it('should settle campaign orders with ledger credit and customer email', async () => {
      const mockCampaignLedger = {
        getSettlementHoldDays: jest.fn().mockResolvedValue(7),
        createPaymentSettled: jest.fn().mockResolvedValue(undefined),
      };
      const mockAudit = { log: jest.fn().mockResolvedValue(undefined) };
      const mockDelivery = {
        enqueueDelivery: jest.fn().mockResolvedValue(undefined),
      };
      const mockAdminNotify = { emit: jest.fn().mockResolvedValue(undefined) };
      const mockRefunds = { applyRefundWebhookEvent: jest.fn() };
      const svc = new PaystackWebhookService(
        prisma,
        config,
        { updatePayoutStatusByReference: jest.fn() } as never,
        mockCampaignLedger as never,
        mockAudit as never,
        observability as never,
        mockDelivery as never,
        mockAdminNotify as never,
        mockRefunds as never,
      );

      (prisma.payment.findFirst as jest.Mock).mockResolvedValue({
        id: 'pay-1',
        providerRef: 'ref-camp',
        status: PaymentStatus.INITIATED,
        settlementClaim: null,
        provider: 'PAYSTACK',
        order: {
          id: 'order-camp',
          status: OrderStatus.PENDING_PAYMENT,
          expiresAt: new Date(Date.now() + 3600000),
          currency: 'NGN',
          totalAmount: 250,
          campaignId: 'camp-1',
          user: { id: 'user-1', email: 'buyer@example.com' },
        },
      });

      await svc.processChargeSuccess({
        event: 'charge.success',
        data: {
          reference: 'ref-camp',
          amount: 25000,
          currency: 'NGN',
          status: 'success',
        },
      });

      expect(mockTx.campaign.update).toHaveBeenCalled();
      expect(mockCampaignLedger.createPaymentSettled).toHaveBeenCalled();
      expect(mockTx.notificationOutbox.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            dedupeKey: 'PaymentConfirmed:order-camp',
            recipient: 'buyer@example.com',
          }),
        }),
      );
      expect(mockDelivery.enqueueDelivery).toHaveBeenCalledWith('outbox-pay-1');
      expect(mockAdminNotify.emit).toHaveBeenCalled();
      expect(observability.recordChargeSettlement).toHaveBeenCalledWith(
        'settled',
      );
    });

    it('should rethrow non-unique transaction failures', async () => {
      (prisma.payment.findFirst as jest.Mock).mockResolvedValue({
        id: 'pay-1',
        providerRef: 'ref-123',
        status: PaymentStatus.INITIATED,
        settlementClaim: null,
        provider: 'PAYSTACK',
        order: {
          id: 'order-1',
          status: OrderStatus.PENDING_PAYMENT,
          expiresAt: new Date(Date.now() + 3600000),
          currency: 'NGN',
          totalAmount: 100,
        },
      });
      (prisma.$transaction as jest.Mock).mockRejectedValue(
        new Error('db down'),
      );

      await expect(
        service.processChargeSuccess({
          event: 'charge.success',
          data: { reference: 'ref-123' },
        }),
      ).rejects.toThrow('db down');
    });

    it('should fail the transaction when order is no longer PENDING_PAYMENT', async () => {
      mockTx.order.updateMany.mockResolvedValue({ count: 0 });
      (prisma.payment.findFirst as jest.Mock).mockResolvedValue({
        id: 'pay-1',
        providerRef: 'ref-123',
        status: PaymentStatus.INITIATED,
        settlementClaim: null,
        provider: 'PAYSTACK',
        order: {
          id: 'order-1',
          status: OrderStatus.PENDING_PAYMENT,
          expiresAt: new Date(Date.now() + 3600000),
          currency: 'NGN',
          totalAmount: 100,
        },
      });

      await expect(
        service.processChargeSuccess({
          event: 'charge.success',
          data: { reference: 'ref-123' },
        }),
      ).rejects.toThrow(/was not PENDING_PAYMENT/);
    });
  });

  describe('handleWebhook', () => {
    it('should throw UnauthorizedException when signature invalid', async () => {
      await expect(
        service.handleWebhook(rawBody, 'invalid-signature'),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('should process charge.success and return true', async () => {
      const signature = crypto
        .createHmac('sha512', secret)
        .update(rawBody)
        .digest('hex');
      (prisma.payment.findFirst as jest.Mock).mockResolvedValue({
        id: 'pay-1',
        providerRef: 'ref-123',
        status: 'INITIATED',
        settlementClaim: null,
        provider: 'PAYSTACK',
        order: {
          id: 'order-1',
          status: OrderStatus.PENDING_PAYMENT,
          expiresAt: new Date(Date.now() + 3600000),
          currency: 'NGN',
          totalAmount: 100,
        },
      });

      const result = await service.handleWebhook(rawBody, signature);

      expect(result).toBe(true);
    });

    it('should route refund.processed to RefundsService', async () => {
      const body = JSON.stringify({
        event: 'refund.processed',
        data: { id: 991, status: 'processed' },
      });
      const signature = crypto
        .createHmac('sha512', secret)
        .update(body)
        .digest('hex');
      const refunds = {
        applyRefundWebhookEvent: jest.fn().mockResolvedValue(true),
      };
      const svc = new PaystackWebhookService(
        prisma,
        config,
        { updatePayoutStatusByReference: jest.fn() } as never,
        {
          getSettlementHoldDays: jest.fn(),
          createPaymentSettled: jest.fn(),
        } as never,
        { log: jest.fn() } as never,
        observability as never,
        { enqueueDelivery: jest.fn() } as never,
        { emit: jest.fn() } as never,
        refunds as never,
      );

      const result = await svc.handleWebhook(body, signature);
      expect(result).toBe(true);
      expect(refunds.applyRefundWebhookEvent).toHaveBeenCalledWith(
        expect.objectContaining({ event: 'refund.processed' }),
      );
    });
  });
});
