import { Test, TestingModule } from '@nestjs/testing';
import {
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OrdersService } from './orders.service';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../prisma/prisma.service';
import { PricingService } from '../pricing/pricing.service';
import { CreateOrderDto } from './dto/create-order.dto';
import { OrderStatus } from '../generated/prisma/enums';
import { NotificationOutboxDeliveryService } from '../mail/notification-outbox-delivery.service';
import { AdminNotifyService } from '../admin-notifications/admin-notify.service';
import { InventoryLowStockNotifier } from '../admin-notifications/inventory-low-stock.notifier';
import { InventoryLifecycleService } from '../inventory/inventory-lifecycle.service';
import { AccountPolicyService } from '../auth/account-policy.service';

const mockAddress = {
  id: 'addr-1',
  userId: 'user-1',
  addressLine1: '123 Main',
  addressLine2: null,
  city: 'Lagos',
  state: 'Lagos',
  postalCode: null,
  country: 'Nigeria',
  recipientName: 'John',
  phone: null,
  landmark: null,
  instructions: null,
};

const mockQuote = {
  currency: 'NGN',
  subtotalAmount: 10000,
  discountAmount: 0,
  shippingFee: 2500,
  vatAmount: 0,
  totalAmount: 12500,
  totalBeforeDisplayRounding: 12500,
  roundingAdjustment: 0,
  vatRate: 0.075,
  pricesIncludeVat: true,
  vatAppliesToShipping: true,
  pricingPolicyVersion: 'ngn-v1-interim-2026-08',
  shippingBreakdown: {
    version: 2,
    provider: 'INTERNAL',
    rateSource: 'ZONE_FLAT_RATE',
    rateId: 'rate-1',
    zoneId: 'zone-1',
    zoneName: 'Lagos',
    appliedFee: 2500,
    currency: 'NGN',
    serviceLevel: 'STANDARD',
    priority: 100,
    vatAppliedToShipping: true,
    resolutionMethod: 'RULE_ADMIN1',
    destination: {
      countryCode: 'NG',
      ruleId: 'rule-1',
      matchType: 'ADMIN1',
      matchValue: 'LA',
      matchContext: null,
      confidence: 'medium',
    },
    estimatedDeliveryMinDays: 2,
    estimatedDeliveryMaxDays: 4,
    shipmentSummary: {
      totalQuantity: 2,
      totalWeightGrams: 600,
      packageLengthMm: 320,
      packageWidthMm: 240,
      packageHeightMm: 80,
      lineItems: [],
    },
  },
  items: [
    {
      productId: 'prod-1',
      variantId: 'var-1',
      designId: null,
      campaignId: null,
      quantity: 2,
      unitBasePrice: 5000,
      unitViewSurcharge: 0,
      unitDiscountAmount: 0,
      unitFinalPrice: 5000,
      lineTotal: 10000,
      organizerCostBasis: null,
      pricingBreakdown: {
        version: 1 as const,
        unitBasePrice: 5000,
        optionValueUpcharge: 0,
        unitViewSurcharge: 0,
        unitDiscountAmount: 0,
        unitFinalPrice: 5000,
      },
      variantSnapshot: [],
    },
  ],
};

const mockOrder = {
  id: 'order-1',
  userId: 'user-1',
  status: OrderStatus.PENDING_PAYMENT,
  paymentStatus: 'PENDING',
  totalAmount: 10000,
  items: [],
};

describe('OrdersService', () => {
  let service: OrdersService;
  let prisma: jest.Mocked<PrismaService>;
  let pricingService: jest.Mocked<PricingService>;

  beforeEach(async () => {
    const mockPrisma = {
      address: { findUnique: jest.fn() },
      design: { findUnique: jest.fn() },
      productVariant: { findUnique: jest.fn() },
      productPrice: { findFirst: jest.fn() },
      user: {
        findUnique: jest
          .fn()
          .mockResolvedValue({ emailVerifiedAt: new Date() }),
      },
      order: {
        create: jest.fn(),
        findMany: jest.fn(),
        findUnique: jest.fn(),
        update: jest.fn(),
      },
      inventoryItem: { findUnique: jest.fn(), update: jest.fn() },
      auditLog: { create: jest.fn().mockResolvedValue({}) },
      notificationOutbox: {
        create: jest.fn().mockResolvedValue({ id: 'outbox-test-1' }),
      },
      $transaction: jest.fn((cb: (tx: unknown) => Promise<unknown>) => {
        const tx = {
          order: {
            create: jest.fn().mockResolvedValue({
              ...mockOrder,
              items: [{ id: 'oi-1', variantId: 'var-1', quantity: 2 }],
            }),
          },
          inventoryItem: {
            findUnique: jest.fn().mockResolvedValue({
              trackInventory: true,
              stockOnHand: 10,
              reserved: 0,
            }),
            update: jest.fn(),
          },
          $executeRaw: jest.fn().mockResolvedValue(1),
        };
        return cb(tx);
      }),
    };

    const mockPricingService = {
      quoteStandard: jest.fn().mockResolvedValue(mockQuote),
      quoteCampaign: jest.fn().mockResolvedValue(mockQuote),
    };

    const mockConfigService = {
      get: jest.fn().mockReturnValue(undefined),
    };

    const mockNotificationOutboxDelivery = {
      enqueueDelivery: jest.fn().mockResolvedValue(undefined),
    };

    const mockAdminNotify = {
      emit: jest.fn().mockResolvedValue(undefined),
    };

    const mockInventoryLowStock = {
      afterInventoryChange: jest.fn().mockResolvedValue(undefined),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OrdersService,
        { provide: AuditService, useValue: { log: jest.fn() } },
        { provide: PrismaService, useValue: mockPrisma },
        { provide: PricingService, useValue: mockPricingService },
        { provide: ConfigService, useValue: mockConfigService },
        {
          provide: NotificationOutboxDeliveryService,
          useValue: mockNotificationOutboxDelivery,
        },
        { provide: AdminNotifyService, useValue: mockAdminNotify },
        {
          provide: InventoryLowStockNotifier,
          useValue: mockInventoryLowStock,
        },
        {
          provide: InventoryLifecycleService,
          useValue: {
            reserveOrderItems: jest.fn().mockResolvedValue(undefined),
            releaseOrderItems: jest.fn().mockResolvedValue(undefined),
            consumeOrderItems: jest.fn().mockResolvedValue(undefined),
          },
        },
        AccountPolicyService,
      ],
    }).compile();

    service = module.get<OrdersService>(OrdersService);
    prisma = module.get(PrismaService);
    pricingService = module.get(PricingService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('create', () => {
    it('should create an order', async () => {
      (prisma.address.findUnique as jest.Mock).mockResolvedValue(mockAddress);
      (prisma.inventoryItem.findUnique as jest.Mock).mockResolvedValue({
        variantId: 'var-1',
        trackInventory: true,
        stockOnHand: 10,
        reserved: 0,
      });

      const dto: CreateOrderDto = {
        shippingAddressId: 'addr-1',
        items: [{ variantId: 'var-1', quantity: 2 }],
      };
      const result = await service.create('user-1', dto);

      expect(pricingService.quoteStandard).toHaveBeenCalledWith(
        'user-1',
        expect.objectContaining({
          shippingAddressId: 'addr-1',
          items: [{ variantId: 'var-1', designId: undefined, quantity: 2 }],
        }),
      );
      expect(prisma.$transaction).toHaveBeenCalled();
      expect(result.id).toBe(mockOrder.id);
    });

    it('should throw BadRequestException when stock is insufficient', async () => {
      (prisma.inventoryItem.findUnique as jest.Mock).mockResolvedValue({
        variantId: 'var-1',
        trackInventory: true,
        stockOnHand: 1,
        reserved: 0,
      });

      const dto: CreateOrderDto = {
        shippingAddressId: 'addr-1',
        items: [{ variantId: 'var-1', quantity: 2 }],
      };

      await expect(service.create('user-1', dto)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should allow order when inventory tracking is disabled', async () => {
      (prisma.address.findUnique as jest.Mock).mockResolvedValue(mockAddress);
      (prisma.inventoryItem.findUnique as jest.Mock).mockResolvedValue({
        variantId: 'var-1',
        trackInventory: false,
      });

      const dto: CreateOrderDto = {
        shippingAddressId: 'addr-1',
        items: [{ variantId: 'var-1', quantity: 2 }],
      };
      const result = await service.create('user-1', dto);

      expect(prisma.$transaction).toHaveBeenCalled();
      expect(result.id).toBe(mockOrder.id);
    });

    it('should throw NotFoundException when address not found', async () => {
      (pricingService.quoteStandard as jest.Mock).mockRejectedValue(
        new NotFoundException('Shipping address not found'),
      );

      const dto: CreateOrderDto = {
        shippingAddressId: 'invalid',
        items: [{ variantId: 'var-1', quantity: 1 }],
      };

      await expect(service.create('user-1', dto)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should throw BadRequestException when shipping is unresolved', async () => {
      (pricingService.quoteStandard as jest.Mock).mockResolvedValue({
        ...mockQuote,
        shippingBreakdown: null,
      });

      const dto: CreateOrderDto = {
        shippingAddressId: 'addr-1',
        items: [{ variantId: 'var-1', quantity: 1 }],
      };

      await expect(service.create('user-1', dto)).rejects.toThrow(
        'Shipping destination could not be resolved for this address',
      );
    });

    it('should throw ForbiddenException when address belongs to another user', async () => {
      (pricingService.quoteStandard as jest.Mock).mockRejectedValue(
        new ForbiddenException('Access denied to this address'),
      );

      const dto: CreateOrderDto = {
        shippingAddressId: 'addr-1',
        items: [{ variantId: 'var-1', quantity: 1 }],
      };

      await expect(service.create('other-user', dto)).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('should throw BadRequestException when items empty', async () => {
      (pricingService.quoteStandard as jest.Mock).mockRejectedValue(
        new BadRequestException('At least one item is required'),
      );

      const dto: CreateOrderDto = {
        shippingAddressId: 'addr-1',
        items: [],
      };

      await expect(service.create('user-1', dto)).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  describe('findAll', () => {
    it('should return orders for user', async () => {
      (prisma.order.findMany as jest.Mock).mockResolvedValue([mockOrder]);

      const result = await service.findAll('user-1');

      expect(prisma.order.findMany).toHaveBeenCalledWith({
        where: { userId: 'user-1' },
        orderBy: { createdAt: 'desc' },
        include: expect.any(Object),
      });
      expect(result).toEqual([mockOrder]);
    });
  });

  describe('findOne', () => {
    it('should return order when user owns it', async () => {
      (prisma.order.findUnique as jest.Mock).mockResolvedValue(mockOrder);

      const result = await service.findOne('user-1', 'order-1');

      expect(result.id).toBe(mockOrder.id);
    });

    it('should throw NotFoundException when order not found', async () => {
      (prisma.order.findUnique as jest.Mock).mockResolvedValue(null);

      await expect(service.findOne('user-1', 'invalid')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should throw ForbiddenException when user does not own order', async () => {
      (prisma.order.findUnique as jest.Mock).mockResolvedValue(mockOrder);

      await expect(service.findOne('other-user', 'order-1')).rejects.toThrow(
        ForbiddenException,
      );
    });
  });

  describe('updateOrderStatus', () => {
    it('releases inventory when cancelling unpaid orders', async () => {
      const release = jest.fn().mockResolvedValue(undefined);
      const module: TestingModule = await Test.createTestingModule({
        providers: [
          OrdersService,
          { provide: AuditService, useValue: { log: jest.fn() } },
          {
            provide: PrismaService,
            useValue: {
              order: {
                findUnique: jest.fn().mockResolvedValue({
                  id: 'order-1',
                  status: OrderStatus.PENDING_PAYMENT,
                  items: [{ id: 'oi-1', variantId: 'var-1', quantity: 2 }],
                  user: { id: 'user-1', email: 'a@b.com', firstName: 'A' },
                }),
                findUniqueOrThrow: jest.fn().mockResolvedValue({
                  id: 'order-1',
                  status: OrderStatus.CANCELLED,
                  items: [],
                }),
              },
              notificationOutbox: {
                create: jest.fn().mockResolvedValue({ id: 'outbox-1' }),
              },
              $transaction: jest.fn(
                async (cb: (tx: unknown) => Promise<unknown>) => {
                  const tx = {
                    order: {
                      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
                      findUniqueOrThrow: jest.fn().mockResolvedValue({
                        id: 'order-1',
                        status: OrderStatus.CANCELLED,
                        items: [],
                      }),
                    },
                  };
                  return cb(tx);
                },
              ),
            },
          },
          {
            provide: PricingService,
            useValue: { quoteStandard: jest.fn(), quoteCampaign: jest.fn() },
          },
          { provide: ConfigService, useValue: { get: jest.fn() } },
          {
            provide: NotificationOutboxDeliveryService,
            useValue: { enqueueDelivery: jest.fn() },
          },
          {
            provide: AdminNotifyService,
            useValue: { emit: jest.fn().mockResolvedValue(undefined) },
          },
          {
            provide: InventoryLowStockNotifier,
            useValue: { afterInventoryChange: jest.fn() },
          },
          {
            provide: InventoryLifecycleService,
            useValue: { releaseOrderItems: release },
          },
          AccountPolicyService,
        ],
      }).compile();

      const orders = module.get(OrdersService);
      await orders.updateOrderStatus('order-1', OrderStatus.CANCELLED);
      expect(release).toHaveBeenCalledWith(
        'order-1',
        [{ id: 'oi-1', variantId: 'var-1', quantity: 2 }],
        expect.anything(),
        { reason: 'admin_cancel_unpaid' },
      );
    });
  });
});
