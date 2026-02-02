import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, BadRequestException } from '@nestjs/common';
import { RefundsService } from './refunds.service';
import { PrismaService } from '../prisma/prisma.service';
import { OrderStatus } from '../generated/prisma/enums';

const mockOrder = {
  id: 'order-1',
  userId: 'user-1',
  status: OrderStatus.PAID,
  totalAmount: 10000,
};

const mockRefund = {
  id: 'refund-1',
  orderId: 'order-1',
  status: 'INITIATED',
  amount: 5000,
};

describe('RefundsService', () => {
  let service: RefundsService;
  let prisma: jest.Mocked<PrismaService>;

  beforeEach(async () => {
    const mockPrisma = {
      order: { findUnique: jest.fn() },
      refund: { create: jest.fn() },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RefundsService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<RefundsService>(RefundsService);
    prisma = module.get(PrismaService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('initiateRefund', () => {
    it('should create a refund', async () => {
      (prisma.order.findUnique as jest.Mock).mockResolvedValue(mockOrder);
      (prisma.refund.create as jest.Mock).mockResolvedValue(mockRefund);

      const result = await service.initiateRefund(
        'order-1',
        5000,
        'Customer request',
      );

      expect(prisma.refund.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          orderId: 'order-1',
          amount: 5000,
          reason: 'Customer request',
        }),
      });
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
  });
});
