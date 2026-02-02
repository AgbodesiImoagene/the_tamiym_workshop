import { Test, TestingModule } from '@nestjs/testing';
import { UnauthorizedException } from '@nestjs/common';
import { PaystackWebhookService } from './paystack-webhook.service';
import { PrismaService } from '../prisma/prisma.service';
import { ConfigService } from '@nestjs/config';
import { PaymentStatus, OrderStatus } from '../generated/prisma/enums';
import * as crypto from 'node:crypto';

describe('PaystackWebhookService', () => {
  let service: PaystackWebhookService;
  let prisma: jest.Mocked<PrismaService>;
  let config: ConfigService;

  const secret = 'sk_test_secret';
  const rawBody = JSON.stringify({
    event: 'charge.success',
    data: { reference: 'ref-123' },
  });

  beforeEach(async () => {
    const mockPrisma = {
      payment: {
        findUnique: jest.fn(),
        findFirst: jest.fn(),
        update: jest.fn(),
      },
      order: {
        findFirst: jest.fn(),
        update: jest.fn(),
      },
    };

    const mockConfig = {
      get: jest.fn((key: string) =>
        key === 'PAYSTACK_SECRET_KEY' ? secret : undefined,
      ),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PaystackWebhookService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: ConfigService, useValue: mockConfig },
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
      const svc = new PaystackWebhookService(prisma, config);
      expect(svc.verifySignature(rawBody, signature)).toBe(false);
    });
  });

  describe('processChargeSuccess', () => {
    it('should be idempotent: skip when payment already SUCCEEDED', async () => {
      (prisma.payment.findUnique as jest.Mock).mockResolvedValue({
        id: 'pay-1',
        idempotencyKey: 'ref-123',
        status: PaymentStatus.SUCCEEDED,
      });

      await service.processChargeSuccess({
        event: 'charge.success',
        data: { reference: 'ref-123' },
      });

      expect(prisma.order.findFirst).not.toHaveBeenCalled();
      expect(prisma.order.update).not.toHaveBeenCalled();
    });

    it('should skip when order not found for reference', async () => {
      (prisma.payment.findUnique as jest.Mock).mockResolvedValue(null);
      (prisma.order.findFirst as jest.Mock).mockResolvedValue(null);

      await service.processChargeSuccess({
        event: 'charge.success',
        data: { reference: 'ref-123' },
      });

      expect(prisma.order.update).not.toHaveBeenCalled();
    });

    it('should skip when order already PAID', async () => {
      (prisma.payment.findUnique as jest.Mock).mockResolvedValue(null);
      (prisma.order.findFirst as jest.Mock).mockResolvedValue({
        id: 'order-1',
        status: OrderStatus.PAID,
      });

      await service.processChargeSuccess({
        event: 'charge.success',
        data: { reference: 'ref-123' },
      });

      expect(prisma.payment.update).not.toHaveBeenCalled();
      expect(prisma.order.update).not.toHaveBeenCalled();
    });

    it('should update payment and order when not yet processed', async () => {
      (prisma.payment.findUnique as jest.Mock).mockResolvedValue(null);
      (prisma.order.findFirst as jest.Mock).mockResolvedValue({
        id: 'order-1',
        status: OrderStatus.PENDING_PAYMENT,
      });
      (prisma.payment.findFirst as jest.Mock).mockResolvedValue({
        id: 'pay-1',
        orderId: 'order-1',
        idempotencyKey: 'ref-123',
      });
      (prisma.payment.update as jest.Mock).mockResolvedValue({});
      (prisma.order.update as jest.Mock).mockResolvedValue({});

      await service.processChargeSuccess({
        event: 'charge.success',
        data: { reference: 'ref-123' },
      });

      expect(prisma.payment.update).toHaveBeenCalledWith({
        where: { id: 'pay-1' },
        data: expect.objectContaining({
          status: PaymentStatus.SUCCEEDED,
        }),
      });
      expect(prisma.order.update).toHaveBeenCalledWith({
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
      (prisma.payment.findUnique as jest.Mock).mockResolvedValue(null);
      (prisma.order.findFirst as jest.Mock).mockResolvedValue({
        id: 'order-1',
        status: OrderStatus.PENDING_PAYMENT,
      });
      (prisma.payment.findFirst as jest.Mock).mockResolvedValue({
        id: 'pay-1',
        orderId: 'order-1',
        idempotencyKey: 'ref-123',
      });
      (prisma.payment.update as jest.Mock).mockResolvedValue({});
      (prisma.order.update as jest.Mock).mockResolvedValue({});

      const result = await service.handleWebhook(rawBody, signature);

      expect(result).toBe(true);
    });
  });
});
