import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { RefundsService } from './refunds.service';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../prisma/prisma.service';
import { CampaignLedgerService } from '../payouts/campaign-ledger.service';
import { OrderStatus } from '../generated/prisma/enums';
import { ObservabilityService } from '../observability/observability.service';
import { NotificationOutboxDeliveryService } from '../mail/notification-outbox-delivery.service';
import { AdminNotifyService } from '../admin-notifications/admin-notify.service';

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

const mockRefund = {
  id: 'refund-1',
  orderId: 'order-1',
  status: 'SUCCEEDED',
  amount: 5000,
  providerRef: 'ref_ref_123',
};

const mockPayment = {
  id: 'pay-1',
  orderId: 'order-1',
  providerRef: 'txn_123',
  status: 'SUCCEEDED',
};

describe('RefundsService', () => {
  let service: RefundsService;
  let prisma: jest.Mocked<PrismaService>;
  let audit: jest.Mocked<AuditService>;

  const originalFetch = globalThis.fetch;

  beforeEach(async () => {
    globalThis.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({ status: true, data: { reference: 'ref_ref_123' } }),
    });

    const mockPrisma = {
      order: {
        findUnique: jest.fn(),
        update: jest.fn().mockResolvedValue(mockOrder),
      },
      payment: { findFirst: jest.fn() },
      refund: {
        create: jest
          .fn()
          .mockResolvedValue({ ...mockRefund, status: 'INITIATED' }),
        update: jest.fn().mockResolvedValue(mockRefund),
        findUnique: jest.fn().mockResolvedValue(mockRefund),
      },
      notificationOutbox: {
        create: jest.fn().mockResolvedValue({ id: 'notif-refund-1' }),
      },
      auditLog: { create: jest.fn().mockResolvedValue({}) },
      $transaction: jest.fn((cb: (tx: unknown) => Promise<unknown>) => {
        const tx = {
          refund: { update: jest.fn().mockResolvedValue(mockRefund) },
          order: { update: jest.fn().mockResolvedValue(mockOrder) },
        };
        return cb(tx);
      }),
    };

    const mockConfig = {
      get: jest.fn((key: string) =>
        key === 'PAYSTACK_SECRET_KEY' ? 'sk_test_xxx' : undefined,
      ),
    };

    const mockCampaignLedger = {
      createRefundApplied: jest.fn().mockResolvedValue(undefined),
    };
    const mockAudit = {
      log: jest.fn().mockResolvedValue(undefined),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RefundsService,
        { provide: AuditService, useValue: mockAudit },
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
            recordRefund: jest.fn(),
          },
        },
        { provide: PrismaService, useValue: mockPrisma },
        { provide: ConfigService, useValue: mockConfig },
        { provide: CampaignLedgerService, useValue: mockCampaignLedger },
        {
          provide: NotificationOutboxDeliveryService,
          useValue: { enqueueDelivery: jest.fn().mockResolvedValue(undefined) },
        },
        {
          provide: AdminNotifyService,
          useValue: { emit: jest.fn().mockResolvedValue(undefined) },
        },
      ],
    }).compile();

    service = module.get<RefundsService>(RefundsService);
    prisma = module.get(PrismaService);
    audit = module.get(AuditService);
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('initiateRefund', () => {
    it('should call Paystack refund API and create refund, then transition order to REFUNDED', async () => {
      (prisma.order.findUnique as jest.Mock).mockResolvedValue(mockOrder);
      (prisma.payment.findFirst as jest.Mock).mockResolvedValue(mockPayment);

      const result = await service.initiateRefund(
        'order-1',
        5000,
        'Customer request',
      );

      expect(globalThis.fetch).toHaveBeenCalledWith(
        'https://api.paystack.co/refund',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({
            transaction: 'txn_123',
            amount: 500000,
            customer_note: 'Customer request',
          }),
        }),
      );
      expect(prisma.refund.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          orderId: 'order-1',
          amount: 5000,
          reason: 'Customer request',
          providerRef: 'ref_ref_123',
        }),
      });
      expect(prisma.$transaction).toHaveBeenCalled();
      expect(audit.log).toHaveBeenCalled();
      expect(result).toEqual(mockRefund);
    });

    it('should throw NotFoundException when order not found', async () => {
      (prisma.order.findUnique as jest.Mock).mockResolvedValue(null);

      await expect(
        service.initiateRefund('invalid', 100, 'reason'),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw BadRequestException when order not PAID', async () => {
      (prisma.order.findUnique as jest.Mock).mockResolvedValue({
        ...mockOrder,
        status: OrderStatus.PENDING_PAYMENT,
      });

      await expect(
        service.initiateRefund('order-1', 100, 'reason'),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException when amount exceeds order total', async () => {
      (prisma.order.findUnique as jest.Mock).mockResolvedValue(mockOrder);

      await expect(
        service.initiateRefund('order-1', 15000, 'reason'),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException when no succeeded payment for order', async () => {
      (prisma.order.findUnique as jest.Mock).mockResolvedValue(mockOrder);
      (prisma.payment.findFirst as jest.Mock).mockResolvedValue(null);

      await expect(
        service.initiateRefund('order-1', 5000, 'reason'),
      ).rejects.toThrow(BadRequestException);
    });
  });
});
