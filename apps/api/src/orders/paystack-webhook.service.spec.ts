import { Test, TestingModule } from '@nestjs/testing';
import { UnauthorizedException } from '@nestjs/common';
import { PaystackWebhookService } from './paystack-webhook.service';
import { PrismaService } from '../prisma/prisma.service';
import { ConfigService } from '@nestjs/config';
import { PayoutsService } from '../payouts/payouts.service';
import { CampaignLedgerService } from '../payouts/campaign-ledger.service';
import { AuditService } from '../audit/audit.service';
import { PaymentStatus, OrderStatus } from '../generated/prisma/enums';
import * as crypto from 'node:crypto';
import { ObservabilityService } from '../observability/observability.service';
import { NotificationOutboxDeliveryService } from '../mail/notification-outbox-delivery.service';
import { AdminNotifyService } from '../admin-notifications/admin-notify.service';

describe('PaystackWebhookService', () => {
  let service: PaystackWebhookService;
  let prisma: jest.Mocked<PrismaService>;
  let config: ConfigService;

  const secret = 'sk_test_secret';
  const rawBody = JSON.stringify({
    event: 'charge.success',
    data: { reference: 'ref-123' },
  });

  const mockTx = {
    payment: { update: jest.fn().mockResolvedValue({}) },
    order: { update: jest.fn().mockResolvedValue({}) },
    campaign: { update: jest.fn().mockResolvedValue({}) },
    campaignBalanceLedgerEntry: { create: jest.fn().mockResolvedValue({}) },
  };

  beforeEach(async () => {
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
    const mockObservability = {
      startSpan: jest.fn(
        async (
          _name: string,
          _attributes: Record<string, unknown>,
          callback: () => Promise<unknown>,
        ) => callback(),
      ),
      recordWebhook: jest.fn(),
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
        { provide: ObservabilityService, useValue: mockObservability },
        {
          provide: NotificationOutboxDeliveryService,
          useValue: mockNotificationOutboxDelivery,
        },
        { provide: AdminNotifyService, useValue: mockAdminNotify },
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
      };
      const mockDelivery = {
        enqueueDelivery: jest.fn(),
      };
      const mockAdminNotify = { emit: jest.fn() };
      const svc = new PaystackWebhookService(
        prisma,
        config,
        mockPayouts as never,
        mockLedger as never,
        mockAudit as never,
        mockObservability as never,
        mockDelivery as never,
        mockAdminNotify as never,
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
        order: { id: 'order-1', status: OrderStatus.PENDING_PAYMENT },
      });

      await service.processChargeSuccess({
        event: 'charge.success',
        data: { reference: 'ref-123' },
      });

      expect(prisma.$transaction).not.toHaveBeenCalled();
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
        order: { id: 'order-1', status: OrderStatus.PAID },
      });

      await service.processChargeSuccess({
        event: 'charge.success',
        data: { reference: 'ref-123' },
      });

      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('should skip when order is CANCELLED', async () => {
      (prisma.payment.findFirst as jest.Mock).mockResolvedValue({
        id: 'pay-1',
        providerRef: 'ref-123',
        status: PaymentStatus.INITIATED,
        order: { id: 'order-1', status: OrderStatus.CANCELLED },
      });

      await service.processChargeSuccess({
        event: 'charge.success',
        data: { reference: 'ref-123' },
      });

      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('should update payment and order when not yet processed', async () => {
      (prisma.payment.findFirst as jest.Mock).mockResolvedValue({
        id: 'pay-1',
        providerRef: 'ref-123',
        status: PaymentStatus.INITIATED,
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
      expect(mockTx.payment.update).toHaveBeenCalledWith({
        where: { id: 'pay-1' },
        data: expect.objectContaining({
          status: PaymentStatus.SUCCEEDED,
        }),
      });
      expect(mockTx.order.update).toHaveBeenCalledWith({
        where: { id: 'order-1' },
        data: {
          status: OrderStatus.PAID,
          paymentStatus: PaymentStatus.SUCCEEDED,
        },
      });
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
  });
});
