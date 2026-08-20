import { Test, TestingModule } from '@nestjs/testing';
import { OrderExpiryService } from './order-expiry.service';
import { PrismaService } from '../prisma/prisma.service';
import { OrderStatus } from '../generated/prisma/enums';
import { ObservabilityService } from '../observability/observability.service';
import { AdminNotifyService } from '../admin-notifications/admin-notify.service';
import { RefundsService } from './refunds.service';

describe('OrderExpiryService', () => {
  let service: OrderExpiryService;
  let prisma: jest.Mocked<PrismaService>;

  beforeEach(async () => {
    const mockPrisma = {
      order: {
        findMany: jest.fn().mockResolvedValue([]),
        update: jest.fn().mockResolvedValue({}),
      },
      inventoryItem: {
        findUnique: jest.fn().mockResolvedValue({
          variantId: 'var-1',
          trackInventory: true,
          reserved: 2,
        }),
        update: jest.fn().mockResolvedValue({}),
      },
      $transaction: jest.fn((cb: (tx: unknown) => Promise<unknown>) => {
        const tx = {
          order: { update: jest.fn().mockResolvedValue({}) },
          inventoryItem: {
            findUnique: jest.fn().mockResolvedValue({
              variantId: 'var-1',
              trackInventory: true,
            }),
            update: jest.fn().mockResolvedValue({}),
          },
        };
        return cb(tx);
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OrderExpiryService,
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
          },
        },
        { provide: PrismaService, useValue: mockPrisma },
        {
          provide: AdminNotifyService,
          useValue: { emit: jest.fn().mockResolvedValue(undefined) },
        },
        {
          provide: RefundsService,
          useValue: {
            failStaleInitiatedRefunds: jest.fn().mockResolvedValue(0),
          },
        },
      ],
    }).compile();

    service = module.get<OrderExpiryService>(OrderExpiryService);
    prisma = module.get(PrismaService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('expirePendingOrders', () => {
    it('should find PENDING_PAYMENT orders with expiresAt in the past', async () => {
      await service.expirePendingOrders();

      expect(prisma.order.findMany).toHaveBeenCalledWith({
        where: {
          status: OrderStatus.PENDING_PAYMENT,
          expiresAt: { lt: expect.any(Date), not: null },
        },
        select: {
          id: true,
          items: { select: { variantId: true, quantity: true } },
        },
      });
    });

    it('should not run transaction when no expired orders', async () => {
      (prisma.order.findMany as jest.Mock).mockResolvedValue([]);
      await service.expirePendingOrders();
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });
  });
});
