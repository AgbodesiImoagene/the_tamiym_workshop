import { Test, TestingModule } from '@nestjs/testing';
import {
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  ConflictException,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OrdersService } from './orders.service';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../prisma/prisma.service';
import { PricingService } from '../pricing/pricing.service';
import { CreateOrderDto } from './dto/create-order.dto';
import { OrderStatus } from '../generated/prisma/enums';
import { Prisma } from '../generated/prisma/client';
import { computeOrderRequestFingerprint } from './order-idempotency';
import { NotificationOutboxDeliveryService } from '../mail/notification-outbox-delivery.service';
import { AdminNotifyService } from '../admin-notifications/admin-notify.service';
import { InventoryLowStockNotifier } from '../admin-notifications/inventory-low-stock.notifier';
import { InventoryLifecycleService } from '../inventory/inventory-lifecycle.service';
import {
  AccountPolicyService,
  ACCOUNT_POLICY_CODE,
} from '../auth/account-policy.service';
import { ShipmentsService } from '../shipments/shipments.service';
import { CUSTOMER_SHIPMENT_ABSENT_MESSAGE } from '../shipments/shipments.constants';

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
      productNameSnapshot: 'Classic Tee',
      variantDisplaySnapshot: 'Small / Red (SKU-1)',
      optionPresentationSnapshot: [],
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
  let orderCreateMock: jest.Mock;

  beforeEach(async () => {
    orderCreateMock = jest.fn().mockResolvedValue({
      ...mockOrder,
      items: [{ id: 'oi-1', variantId: 'var-1', quantity: 2 }],
    });

    const mockPrisma = {
      address: { findUnique: jest.fn() },
      campaign: { findUnique: jest.fn().mockResolvedValue({ id: 'camp-1' }) },
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
      shipment: {
        findFirst: jest.fn().mockResolvedValue(null),
      },
      inventoryItem: { findUnique: jest.fn(), update: jest.fn() },
      auditLog: { create: jest.fn().mockResolvedValue({}) },
      notificationOutbox: {
        create: jest.fn().mockResolvedValue({ id: 'outbox-test-1' }),
      },
      $transaction: jest.fn((cb: (tx: unknown) => Promise<unknown>) => {
        const tx = {
          order: {
            create: orderCreateMock,
          },
          orderDiscount: { create: jest.fn() },
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
        {
          provide: ShipmentsService,
          useValue: {
            getCustomerSummaryForOrder: jest.fn().mockResolvedValue(null),
          },
        },
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

    it('writes PURCHASE display snapshots on create', async () => {
      (prisma.address.findUnique as jest.Mock).mockResolvedValue(mockAddress);
      (prisma.inventoryItem.findUnique as jest.Mock).mockResolvedValue({
        variantId: 'var-1',
        trackInventory: true,
        stockOnHand: 10,
        reserved: 0,
      });

      await service.create('user-1', {
        shippingAddressId: 'addr-1',
        items: [{ variantId: 'var-1', quantity: 2 }],
      });

      expect(orderCreateMock).toHaveBeenCalled();
      const createArg = orderCreateMock.mock.calls[0][0];
      const line = createArg.data.items.create[0];
      expect(line.productNameSnapshot).toBe('Classic Tee');
      expect(line.variantDisplaySnapshot).toBe('Small / Red (SKU-1)');
      expect(line.optionPresentationSnapshot).toEqual([]);
      expect(line.snapshotSource).toBe('PURCHASE');
      expect(line.snapshotVersion).toBe(1);
    });

    it('writes PURCHASE display snapshots on campaign create', async () => {
      (prisma.address.findUnique as jest.Mock).mockResolvedValue(mockAddress);
      (prisma.inventoryItem.findUnique as jest.Mock).mockResolvedValue({
        variantId: 'var-1',
        trackInventory: true,
        stockOnHand: 10,
        reserved: 0,
      });

      await service.createCampaignOrder('camp-1', 'user-1', {
        shippingAddressId: 'addr-1',
        items: [{ variantId: 'var-1', quantity: 2 }],
      });

      const createArg = orderCreateMock.mock.calls.at(-1)?.[0];
      const line = createArg.data.items.create[0];
      expect(line.campaignId).toBe('camp-1');
      expect(line.snapshotSource).toBe('PURCHASE');
      expect(line.productNameSnapshot).toBe('Classic Tee');
    });

    it('rejects unverified users with EMAIL_NOT_VERIFIED', async () => {
      (prisma.user.findUnique as jest.Mock).mockResolvedValue({
        emailVerifiedAt: null,
      });
      try {
        await service.create('user-1', {
          shippingAddressId: 'addr-1',
          items: [{ variantId: 'var-1', quantity: 1 }],
        });
        fail('expected ForbiddenException');
      } catch (err) {
        expect(err).toBeInstanceOf(ForbiddenException);
        const body = (err as ForbiddenException).getResponse() as Record<
          string,
          unknown
        >;
        expect(body.code).toBe(ACCOUNT_POLICY_CODE.EMAIL_NOT_VERIFIED);
        expect(body.action).toBe('CREATE_ORDER');
      }
      expect(pricingService.quoteStandard).not.toHaveBeenCalled();
    });

    it('rejects unverified campaign order create', async () => {
      (prisma.user.findUnique as jest.Mock).mockResolvedValue({
        emailVerifiedAt: null,
      });
      try {
        await service.createCampaignOrder('camp-1', 'user-1', {
          shippingAddressId: 'addr-1',
          items: [{ variantId: 'var-1', quantity: 1 }],
        });
        fail('expected ForbiddenException');
      } catch (err) {
        expect(err).toBeInstanceOf(ForbiddenException);
        const body = (err as ForbiddenException).getResponse() as Record<
          string,
          unknown
        >;
        expect(body.code).toBe(ACCOUNT_POLICY_CODE.EMAIL_NOT_VERIFIED);
        expect(body.action).toBe('CREATE_ORDER');
      }
    });

    it('rejects order create when the user record is missing', async () => {
      (prisma.user.findUnique as jest.Mock).mockResolvedValue(null);
      await expect(
        service.create('user-1', {
          shippingAddressId: 'addr-1',
          items: [{ variantId: 'var-1', quantity: 1 }],
        }),
      ).rejects.toBeInstanceOf(ForbiddenException);
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

    it('gives the stable SHIPPING_ADDRESS_NOT_COVERED code when shipping is unresolved (TTW-086)', async () => {
      (pricingService.quoteStandard as jest.Mock).mockResolvedValue({
        ...mockQuote,
        shippingBreakdown: null,
      });

      const error: unknown = await service
        .create('user-1', {
          shippingAddressId: 'addr-1',
          items: [{ variantId: 'var-1', quantity: 1 }],
        })
        .then(
          () => undefined,
          (e: unknown) => e,
        );

      expect(error).toBeInstanceOf(BadRequestException);
      expect((error as BadRequestException).getResponse()).toMatchObject({
        code: 'SHIPPING_ADDRESS_NOT_COVERED',
      });
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

  describe('create idempotency (TTW-037)', () => {
    const uniqueViolation = () =>
      new Prisma.PrismaClientKnownRequestError('unique', {
        code: 'P2002',
        clientVersion: 'test',
      });

    // Replays now also require the same request content (review finding 6).
    const fingerprintFor = (campaignId: string | null, quantity = 2) =>
      computeOrderRequestFingerprint({
        campaignId,
        address: mockAddress,
        items: [{ variantId: 'var-1', quantity }],
      });

    const existingStandardOrder = {
      ...mockOrder,
      id: 'order-existing',
      campaignId: null,
      idempotencyKey: 'idem-1',
      idempotencyFingerprint: fingerprintFor(null),
    };

    const existingCampaignOrder = {
      ...existingStandardOrder,
      campaignId: 'camp-1',
      idempotencyFingerprint: fingerprintFor('camp-1'),
    };

    beforeEach(() => {
      (prisma.address.findUnique as jest.Mock).mockResolvedValue(mockAddress);
      (prisma.inventoryItem.findUnique as jest.Mock).mockResolvedValue({
        variantId: 'var-1',
        trackInventory: true,
        stockOnHand: 10,
        reserved: 0,
      });
    });

    function expectConflict(err: unknown) {
      expect(err).toBeInstanceOf(ConflictException);
      const body = (err as ConflictException).getResponse() as Record<
        string,
        unknown
      >;
      expect(body.code).toBe('IDEMPOTENCY_KEY_REUSED');
    }

    it('returns the order that won a concurrent create with the same key', async () => {
      (prisma.order.findUnique as jest.Mock)
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(existingStandardOrder);
      orderCreateMock.mockRejectedValueOnce(uniqueViolation());

      const result = await service.create('user-1', {
        shippingAddressId: 'addr-1',
        items: [{ variantId: 'var-1', quantity: 2 }],
        idempotencyKey: 'idem-1',
      });

      expect(result.id).toBe('order-existing');
      expect(prisma.order.findUnique).toHaveBeenLastCalledWith(
        expect.objectContaining({
          where: {
            userId_idempotencyKey: {
              userId: 'user-1',
              idempotencyKey: 'idem-1',
            },
          },
        }),
      );
      expect(prisma.notificationOutbox.create).not.toHaveBeenCalled();
    });

    it('returns the campaign order that won a concurrent create with the same key', async () => {
      (prisma.order.findUnique as jest.Mock)
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(existingCampaignOrder);
      orderCreateMock.mockRejectedValueOnce(uniqueViolation());

      const result = await service.createCampaignOrder('camp-1', 'user-1', {
        shippingAddressId: 'addr-1',
        items: [{ variantId: 'var-1', quantity: 2 }],
        idempotencyKey: 'idem-1',
      });

      expect(result.id).toBe('order-existing');
    });

    // Review finding 3: the winner committed between our pre-read and our stock check.
    it('returns the existing order when the stock check fails after a concurrent create', async () => {
      (prisma.order.findUnique as jest.Mock)
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(existingStandardOrder);
      (prisma.inventoryItem.findUnique as jest.Mock).mockResolvedValue({
        variantId: 'var-1',
        trackInventory: true,
        stockOnHand: 2,
        reserved: 2,
      });

      const result = await service.create('user-1', {
        shippingAddressId: 'addr-1',
        items: [{ variantId: 'var-1', quantity: 2 }],
        idempotencyKey: 'idem-1',
      });

      expect(result.id).toBe('order-existing');
      expect(orderCreateMock).not.toHaveBeenCalled();
    });

    it('returns the existing campaign order when the stock check fails after a concurrent create', async () => {
      (prisma.order.findUnique as jest.Mock)
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(existingCampaignOrder);
      (prisma.inventoryItem.findUnique as jest.Mock).mockResolvedValue({
        variantId: 'var-1',
        trackInventory: true,
        stockOnHand: 2,
        reserved: 2,
      });

      const result = await service.createCampaignOrder('camp-1', 'user-1', {
        shippingAddressId: 'addr-1',
        items: [{ variantId: 'var-1', quantity: 2 }],
        idempotencyKey: 'idem-1',
      });

      expect(result.id).toBe('order-existing');
    });

    it('still reports insufficient stock when no order exists for the key', async () => {
      (prisma.order.findUnique as jest.Mock).mockResolvedValue(null);
      (prisma.inventoryItem.findUnique as jest.Mock).mockResolvedValue({
        variantId: 'var-1',
        trackInventory: true,
        stockOnHand: 2,
        reserved: 2,
      });

      await expect(
        service.create('user-1', {
          shippingAddressId: 'addr-1',
          items: [{ variantId: 'var-1', quantity: 2 }],
          idempotencyKey: 'idem-1',
        }),
      ).rejects.toThrow('Insufficient stock for variant var-1');
    });

    function expectPayloadMismatch(err: unknown) {
      expect(err).toBeInstanceOf(ConflictException);
      const body = (err as ConflictException).getResponse() as Record<
        string,
        unknown
      >;
      expect(body.code).toBe('IDEMPOTENCY_KEY_PAYLOAD_MISMATCH');
    }

    // Review finding 6: a known key replays only the same request content.
    it('stores the request fingerprint with the key', async () => {
      (prisma.order.findUnique as jest.Mock).mockResolvedValue(null);

      await service.create('user-1', {
        shippingAddressId: 'addr-1',
        items: [{ variantId: 'var-1', quantity: 2 }],
        idempotencyKey: 'idem-1',
      });

      expect(orderCreateMock.mock.calls[0][0].data).toMatchObject({
        idempotencyKey: 'idem-1',
        idempotencyFingerprint: fingerprintFor(null),
      });
    });

    it('stores the campaign request fingerprint with the key', async () => {
      (prisma.order.findUnique as jest.Mock).mockResolvedValue(null);

      await service.createCampaignOrder('camp-1', 'user-1', {
        shippingAddressId: 'addr-1',
        items: [{ variantId: 'var-1', quantity: 2 }],
        idempotencyKey: 'idem-1',
      });

      expect(orderCreateMock.mock.calls[0][0].data).toMatchObject({
        idempotencyFingerprint: fingerprintFor('camp-1'),
      });
    });

    it('stores no fingerprint without a key', async () => {
      await service.create('user-1', {
        shippingAddressId: 'addr-1',
        items: [{ variantId: 'var-1', quantity: 2 }],
      });

      expect(
        orderCreateMock.mock.calls[0][0].data.idempotencyFingerprint,
      ).toBeNull();
    });

    it('replays a known key with the same content', async () => {
      (prisma.order.findUnique as jest.Mock).mockResolvedValue(
        existingStandardOrder,
      );

      const result = await service.create('user-1', {
        shippingAddressId: 'addr-1',
        items: [{ variantId: 'var-1', quantity: 2 }],
        idempotencyKey: 'idem-1',
      });

      expect(result.id).toBe('order-existing');
      expect(orderCreateMock).not.toHaveBeenCalled();
    });

    it('rejects a known key sent with different lines', async () => {
      (prisma.order.findUnique as jest.Mock).mockResolvedValue(
        existingStandardOrder,
      );

      const err = await service
        .create('user-1', {
          shippingAddressId: 'addr-1',
          items: [{ variantId: 'var-1', quantity: 3 }],
          idempotencyKey: 'idem-1',
        })
        .catch((e: unknown) => e);

      expectPayloadMismatch(err);
      expect(orderCreateMock).not.toHaveBeenCalled();
    });

    it('rejects a known key after the saved delivery address changed', async () => {
      (prisma.order.findUnique as jest.Mock).mockResolvedValue(
        existingStandardOrder,
      );
      (prisma.address.findUnique as jest.Mock).mockResolvedValue({
        ...mockAddress,
        city: 'Lekki',
      });

      const err = await service
        .create('user-1', {
          shippingAddressId: 'addr-1',
          items: [{ variantId: 'var-1', quantity: 2 }],
          idempotencyKey: 'idem-1',
        })
        .catch((e: unknown) => e);

      expectPayloadMismatch(err);
    });

    it('rejects a known key whose order has no fingerprint', async () => {
      (prisma.order.findUnique as jest.Mock).mockResolvedValue({
        ...existingStandardOrder,
        idempotencyFingerprint: null,
      });

      const err = await service
        .create('user-1', {
          shippingAddressId: 'addr-1',
          items: [{ variantId: 'var-1', quantity: 2 }],
          idempotencyKey: 'idem-1',
        })
        .catch((e: unknown) => e);

      expectPayloadMismatch(err);
    });

    it('rejects a concurrent replay with different content', async () => {
      (prisma.order.findUnique as jest.Mock)
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({
          ...existingStandardOrder,
          idempotencyFingerprint: fingerprintFor(null, 5),
        });
      orderCreateMock.mockRejectedValueOnce(uniqueViolation());

      const err = await service
        .create('user-1', {
          shippingAddressId: 'addr-1',
          items: [{ variantId: 'var-1', quantity: 2 }],
          idempotencyKey: 'idem-1',
        })
        .catch((e: unknown) => e);

      expectPayloadMismatch(err);
    });

    // Independent review finding 3: the fingerprint and the order snapshot must come
    // from the same address row, or an edit in between splits them.
    it('reads the delivery address once for the fingerprint and the order snapshot', async () => {
      (prisma.order.findUnique as jest.Mock).mockResolvedValue(null);

      await service.create('user-1', {
        shippingAddressId: 'addr-1',
        items: [{ variantId: 'var-1', quantity: 2 }],
        idempotencyKey: 'idem-1',
      });

      expect(prisma.address.findUnique).toHaveBeenCalledTimes(1);
    });

    it('reads the delivery address once for a campaign order too', async () => {
      (prisma.order.findUnique as jest.Mock).mockResolvedValue(null);

      await service.createCampaignOrder('camp-1', 'user-1', {
        shippingAddressId: 'addr-1',
        items: [{ variantId: 'var-1', quantity: 2 }],
        idempotencyKey: 'idem-1',
      });

      expect(prisma.address.findUnique).toHaveBeenCalledTimes(1);
    });

    // Independent review finding 6: replays are logged with the order id only.
    it('logs a replay with the order id and without the key', async () => {
      const logSpy = jest
        .spyOn(Logger.prototype, 'log')
        .mockImplementation(() => undefined);
      (prisma.order.findUnique as jest.Mock).mockResolvedValue(
        existingStandardOrder,
      );

      await service.create('user-1', {
        shippingAddressId: 'addr-1',
        items: [{ variantId: 'var-1', quantity: 2 }],
        idempotencyKey: 'idem-1',
      });

      const messages = logSpy.mock.calls.map(([message]) => String(message));
      logSpy.mockRestore();
      expect(messages.some((m) => m.includes('order-existing'))).toBe(true);
      expect(messages.some((m) => m.includes('idem-1'))).toBe(false);
    });

    describe('customer note (TTW-197)', () => {
      const body = {
        shippingAddressId: 'addr-1',
        items: [{ variantId: 'var-1', quantity: 2 }],
        idempotencyKey: 'idem-1',
      };

      it('stores the note on a standard order', async () => {
        (prisma.order.findUnique as jest.Mock).mockResolvedValue(null);
        await service.create('user-1', { ...body, customerNote: 'Pack apart' });
        expect(orderCreateMock.mock.calls[0][0].data.customerNote).toBe(
          'Pack apart',
        );
      });

      it('stores the note on a campaign order', async () => {
        (prisma.order.findUnique as jest.Mock).mockResolvedValue(null);
        await service.createCampaignOrder('camp-1', 'user-1', {
          ...body,
          customerNote: 'Logo smaller',
        });
        expect(orderCreateMock.mock.calls[0][0].data.customerNote).toBe(
          'Logo smaller',
        );
      });

      it('stores null when there is no note', async () => {
        await service.create('user-1', {
          shippingAddressId: 'addr-1',
          items: [{ variantId: 'var-1', quantity: 2 }],
        });
        expect(orderCreateMock.mock.calls[0][0].data.customerNote).toBeNull();
      });

      it('puts the note in the stored fingerprint', async () => {
        (prisma.order.findUnique as jest.Mock).mockResolvedValue(null);
        await service.create('user-1', { ...body, customerNote: 'Pack apart' });
        expect(
          orderCreateMock.mock.calls[0][0].data.idempotencyFingerprint,
        ).toBe(
          computeOrderRequestFingerprint({
            campaignId: null,
            address: mockAddress,
            items: [{ variantId: 'var-1', quantity: 2 }],
            customerNote: 'Pack apart',
          }),
        );
      });

      it('replays a known key with the same note', async () => {
        (prisma.order.findUnique as jest.Mock).mockResolvedValue({
          ...existingStandardOrder,
          idempotencyFingerprint: computeOrderRequestFingerprint({
            campaignId: null,
            address: mockAddress,
            items: [{ variantId: 'var-1', quantity: 2 }],
            customerNote: 'Pack apart',
          }),
        });
        const result = await service.create('user-1', {
          ...body,
          customerNote: 'Pack apart',
        });
        expect(result.id).toBe('order-existing');
        expect(orderCreateMock).not.toHaveBeenCalled();
      });

      it('rejects a known key sent with another note, or a note added', async () => {
        (prisma.order.findUnique as jest.Mock).mockResolvedValue({
          ...existingStandardOrder,
          idempotencyFingerprint: computeOrderRequestFingerprint({
            campaignId: null,
            address: mockAddress,
            items: [{ variantId: 'var-1', quantity: 2 }],
            customerNote: 'Pack apart',
          }),
        });
        const other = await service
          .create('user-1', { ...body, customerNote: 'Something else' })
          .catch((e: unknown) => e);
        expectPayloadMismatch(other);

        (prisma.order.findUnique as jest.Mock).mockResolvedValue(
          existingStandardOrder,
        );
        const added = await service
          .create('user-1', { ...body, customerNote: 'New note' })
          .catch((e: unknown) => e);
        expectPayloadMismatch(added);
        expect(orderCreateMock).not.toHaveBeenCalled();
      });

      it('writes the note to no log line', async () => {
        const spies = (
          ['log', 'warn', 'error', 'debug', 'verbose'] as const
        ).map((level) =>
          jest
            .spyOn(Logger.prototype, level)
            .mockImplementation(() => undefined),
        );
        (prisma.order.findUnique as jest.Mock).mockResolvedValue(null);
        await service.create('user-1', {
          ...body,
          customerNote: 'PRIVATE-NOTE-TEXT',
        });
        const printed = JSON.stringify(spies.flatMap((s) => s.mock.calls));
        spies.forEach((s) => s.mockRestore());
        expect(printed).not.toContain('PRIVATE-NOTE-TEXT');
      });
    });

    it('rethrows a unique violation that is not an idempotency replay', async () => {
      (prisma.order.findUnique as jest.Mock).mockResolvedValue(null);
      orderCreateMock.mockRejectedValueOnce(uniqueViolation());

      await expect(
        service.create('user-1', {
          shippingAddressId: 'addr-1',
          items: [{ variantId: 'var-1', quantity: 2 }],
          idempotencyKey: 'idem-1',
        }),
      ).rejects.toBeInstanceOf(Prisma.PrismaClientKnownRequestError);
    });

    it('rejects a standard create whose key belongs to a campaign order', async () => {
      (prisma.order.findUnique as jest.Mock).mockResolvedValue({
        ...existingStandardOrder,
        campaignId: 'camp-1',
      });

      const err = await service
        .create('user-1', {
          shippingAddressId: 'addr-1',
          items: [{ variantId: 'var-1', quantity: 2 }],
          idempotencyKey: 'idem-1',
        })
        .catch((e: unknown) => e);

      expectConflict(err);
      expect(orderCreateMock).not.toHaveBeenCalled();
    });

    it('rejects a campaign create whose key belongs to another order kind', async () => {
      (prisma.order.findUnique as jest.Mock).mockResolvedValue(
        existingStandardOrder,
      );

      const err = await service
        .createCampaignOrder('camp-1', 'user-1', {
          shippingAddressId: 'addr-1',
          items: [{ variantId: 'var-1', quantity: 2 }],
          idempotencyKey: 'idem-1',
        })
        .catch((e: unknown) => e);

      expectConflict(err);
      expect(orderCreateMock).not.toHaveBeenCalled();
    });

    it('rejects a concurrent replay that resolves to another order kind', async () => {
      (prisma.order.findUnique as jest.Mock)
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({
          ...existingStandardOrder,
          campaignId: 'camp-other',
        });
      orderCreateMock.mockRejectedValueOnce(uniqueViolation());

      const err = await service
        .createCampaignOrder('camp-1', 'user-1', {
          shippingAddressId: 'addr-1',
          items: [{ variantId: 'var-1', quantity: 2 }],
          idempotencyKey: 'idem-1',
        })
        .catch((e: unknown) => e);

      expectConflict(err);
    });
  });

  describe('findAll', () => {
    it('should return customer-safe list projection for user', async () => {
      (prisma.order.findMany as jest.Mock).mockResolvedValue([
        {
          id: 'order-1',
          status: OrderStatus.PENDING_PAYMENT,
          paymentStatus: 'PENDING',
          currency: 'NGN',
          totalAmount: 10000,
          createdAt: new Date('2026-08-21T00:00:00.000Z'),
          expiresAt: null,
          items: [
            {
              id: 'oi-1',
              quantity: 2,
              productNameSnapshot: 'Classic Tee',
              variantDisplaySnapshot: 'Small (SKU-1)',
              snapshotSource: 'PURCHASE',
              unitFinalPrice: 5000,
            },
          ],
        },
      ]);

      const result = await service.findAll('user-1');

      expect(prisma.order.findMany).toHaveBeenCalledWith({
        where: { userId: 'user-1' },
        orderBy: { createdAt: 'desc' },
        select: expect.any(Object),
      });
      expect(result[0].items[0].productNameSnapshot).toBe('Classic Tee');
      expect(result[0].totalAmount).toBe(10000);
    });
  });

  describe('findOne', () => {
    const ownedDetailRow = {
      id: 'order-1',
      userId: 'user-1',
      status: OrderStatus.PENDING_PAYMENT,
      paymentStatus: 'PENDING',
      currency: 'NGN',
      subtotalAmount: 10000,
      shippingFee: 2500,
      discountAmount: 0,
      vatAmount: null,
      totalAmount: 12500,
      createdAt: new Date('2026-08-21T00:00:00.000Z'),
      updatedAt: new Date('2026-08-21T00:00:00.000Z'),
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      cancelledAt: null,
      paymentReference: null,
      shipRecipientName: 'John',
      shipPhone: null,
      shipLine1: '123 Main',
      shipLine2: null,
      shipCity: 'Lagos',
      shipState: 'Lagos',
      shipPostalCode: null,
      shipCountry: 'Nigeria',
      shipLandmark: null,
      campaignId: null,
      campaign: null,
      items: [
        {
          id: 'oi-1',
          productId: 'prod-1',
          variantId: 'var-1',
          designId: null,
          campaignId: null,
          quantity: 2,
          unitFinalPrice: 5000,
          productNameSnapshot: 'Classic Tee',
          variantDisplaySnapshot: 'Small (SKU-1)',
          optionPresentationSnapshot: [
            {
              option: 'Size',
              optionCode: 'size',
              value: 'Small',
              valueCode: 'S',
            },
          ],
          snapshotSource: 'PURCHASE',
          snapshotVersion: 1,
        },
      ],
      payments: [],
      refunds: [],
    };

    it('should return customer-safe DTO when user owns it', async () => {
      (prisma.order.findUnique as jest.Mock).mockResolvedValue(ownedDetailRow);

      const result = await service.findOne('user-1', 'order-1');

      expect(result.id).toBe('order-1');
      expect(result.policyVersion).toContain('customer-order-detail');
      expect(result.shipping.line1).toBe('123 Main');
      expect(result.items[0].productNameSnapshot).toBe('Classic Tee');
      expect(result.paymentRetryEligible).toBe(true);
      expect(result.shipment).toBeNull();
      expect(result.shipmentPlaceholder).toBe(CUSTOMER_SHIPMENT_ABSENT_MESSAGE);
      expect(result).not.toHaveProperty('shippingAddress');
      expect(result).not.toHaveProperty('idempotencyKey');
      expect(result).not.toHaveProperty('userId');
      expect(JSON.stringify(result)).not.toMatch(
        /rawEvent|authorizationUrl|accessCode|organizerCostBasis/,
      );
    });

    it('includes customer-safe shipment timeline when present', async () => {
      (prisma.order.findUnique as jest.Mock).mockResolvedValue(ownedDetailRow);
      const shipments = (service as unknown as { shipments: ShipmentsService })
        .shipments;
      (shipments.getCustomerSummaryForOrder as jest.Mock).mockResolvedValue({
        policyVersion: 'shipment-lifecycle/v1-interim-2026-08-21',
        id: 'ship-1',
        status: 'DISPATCHED',
        carrierName: 'Manual dispatch',
        trackingNumber: 'TRK1',
        trackingUrl: null,
        estimatedDeliveryAt: null,
        exceptionCode: null,
        exceptionMessage: null,
        events: [
          {
            id: 'evt-1',
            type: 'READY',
            occurredAt: '2026-08-21T00:00:00.000Z',
            customerMessage: 'Ready',
            exceptionCode: null,
          },
        ],
      });

      const result = await service.findOne('user-1', 'order-1');

      expect(result.shipment?.id).toBe('ship-1');
      expect(result.shipment?.trackingNumber).toBe('TRK1');
      expect(result.shipmentPlaceholder).toBeNull();
      expect(JSON.stringify(result.shipment)).not.toMatch(
        /privateNotes|actorUserId/,
      );
    });

    it('redacts provider fields and marks legacy snapshot disclosure', async () => {
      (prisma.order.findUnique as jest.Mock).mockResolvedValue({
        ...ownedDetailRow,
        items: [
          {
            ...ownedDetailRow.items[0],
            snapshotSource: 'BACKFILLED_CURRENT_CATALOG',
          },
        ],
        payments: [
          {
            id: 'pay-1',
            status: 'SUCCEEDED',
            amount: 12500,
            currency: 'NGN',
            providerRef: 'ref-1',
            createdAt: new Date('2026-08-21T00:00:00.000Z'),
            expiresAt: null,
            rawEvent: { secret: true },
            idempotencyKey: 'idem-1',
            authorizationUrl: 'https://checkout.paystack.com/x',
          },
        ],
        refunds: [
          {
            id: 'ref-1',
            status: 'SUCCEEDED',
            amount: 2500,
            currency: 'NGN',
            reason: 'partial',
            createdAt: new Date('2026-08-21T01:00:00.000Z'),
            idempotencyKey: 'refund-idem',
          },
        ],
      });

      const result = await service.findOne('user-1', 'order-1');

      expect(result.items[0].legacySnapshotDisclosure).toBe(true);
      expect(result.refundedAmountConfirmed).toBe(2500);
      expect(result.payments[0]).toEqual(
        expect.objectContaining({
          id: 'pay-1',
          providerRef: 'ref-1',
        }),
      );
      expect(result.payments[0]).not.toHaveProperty('rawEvent');
      expect(result.payments[0]).not.toHaveProperty('idempotencyKey');
      expect(result.payments[0]).not.toHaveProperty('authorizationUrl');
      expect(result.refunds[0]).not.toHaveProperty('idempotencyKey');
    });

    it('reads the customer note and returns it as text (TTW-197)', async () => {
      (prisma.order.findUnique as jest.Mock).mockResolvedValue({
        ...ownedDetailRow,
        customerNote: '<b>Pack apart</b>',
      });

      const result = await service.findOne('user-1', 'order-1');

      expect(result.customerNote).toBe('<b>Pack apart</b>');
      expect(prisma.order.findUnique).toHaveBeenCalledWith(
        expect.objectContaining({
          select: expect.objectContaining({ customerNote: true }),
        }),
      );
    });

    it('returns a null note when the order has none (TTW-197)', async () => {
      (prisma.order.findUnique as jest.Mock).mockResolvedValue({
        ...ownedDetailRow,
        customerNote: null,
      });
      expect(
        (await service.findOne('user-1', 'order-1')).customerNote,
      ).toBeNull();
    });

    // TTW-198: the customer sees the instructions saved on the order, not the live address.
    it('returns the delivery instructions from the order snapshot', async () => {
      (prisma.order.findUnique as jest.Mock).mockResolvedValue({
        ...ownedDetailRow,
        shipInstructions: 'Ring twice\nLeave with the guard',
      });

      const result = await service.findOne('user-1', 'order-1');

      expect(result.shipping.instructions).toBe(
        'Ring twice\nLeave with the guard',
      );
      expect(prisma.order.findUnique).toHaveBeenCalledWith(
        expect.objectContaining({
          select: expect.objectContaining({ shipInstructions: true }),
        }),
      );
    });

    it('returns null instructions when the order has none (older orders)', async () => {
      (prisma.order.findUnique as jest.Mock).mockResolvedValue({
        ...ownedDetailRow,
        shipInstructions: null,
      });

      const result = await service.findOne('user-1', 'order-1');

      expect(result.shipping.instructions).toBeNull();
    });

    it('should throw NotFoundException when order not found', async () => {
      (prisma.order.findUnique as jest.Mock).mockResolvedValue(null);

      await expect(service.findOne('user-1', 'invalid')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should throw NotFoundException when user does not own order', async () => {
      (prisma.order.findUnique as jest.Mock).mockResolvedValue(ownedDetailRow);

      await expect(service.findOne('other-user', 'order-1')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('isPaymentRetryEligible', () => {
    const now = new Date('2026-08-21T12:00:00.000Z');

    it('returns true for unexpired PENDING_PAYMENT with no active attempt', () => {
      expect(
        service.isPaymentRetryEligible({
          status: OrderStatus.PENDING_PAYMENT,
          expiresAt: new Date('2026-08-22T00:00:00.000Z'),
          payments: [],
          now,
        }),
      ).toBe(true);
    });

    it('returns false when an active attempt has no expiry', () => {
      expect(
        service.isPaymentRetryEligible({
          status: OrderStatus.PENDING_PAYMENT,
          expiresAt: new Date('2026-08-22T00:00:00.000Z'),
          payments: [
            {
              status: 'PENDING' as never,
              expiresAt: null,
            },
          ],
          now,
        }),
      ).toBe(false);
    });

    it('returns false when an active attempt exists', () => {
      expect(
        service.isPaymentRetryEligible({
          status: OrderStatus.PENDING_PAYMENT,
          expiresAt: new Date('2026-08-22T00:00:00.000Z'),
          payments: [
            {
              status: 'INITIATED' as never,
              expiresAt: new Date('2026-08-21T13:00:00.000Z'),
            },
          ],
          now,
        }),
      ).toBe(false);
    });

    it('returns false when order is expired', () => {
      expect(
        service.isPaymentRetryEligible({
          status: OrderStatus.PENDING_PAYMENT,
          expiresAt: new Date('2026-08-21T11:00:00.000Z'),
          payments: [],
          now,
        }),
      ).toBe(false);
    });

    it('returns false when order is not PENDING_PAYMENT', () => {
      expect(
        service.isPaymentRetryEligible({
          status: OrderStatus.PAID,
          expiresAt: null,
          payments: [],
          now,
        }),
      ).toBe(false);
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
          {
            provide: ShipmentsService,
            useValue: {
              getCustomerSummaryForOrder: jest.fn().mockResolvedValue(null),
            },
          },
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

    it('rejects paid PROCESSING cancel with stable TTW-041 code', async () => {
      (prisma.order.findUnique as jest.Mock).mockResolvedValue({
        id: 'order-1',
        status: OrderStatus.PROCESSING,
        items: [{ id: 'oi-1', variantId: 'var-1', quantity: 2 }],
        user: { id: 'user-1', email: 'a@b.com', firstName: 'A' },
      });

      await expect(
        service.updateOrderStatus('order-1', OrderStatus.CANCELLED),
      ).rejects.toMatchObject({
        response: {
          code: 'CANCEL_NOT_ALLOWED_USE_REFUND',
        },
      });
    });

    it('rejects direct FULFILLED and DELIVERED bypass', async () => {
      (prisma.order.findUnique as jest.Mock).mockResolvedValue({
        id: 'order-1',
        status: OrderStatus.PROCESSING,
        items: [],
        user: { id: 'user-1', email: 'a@b.com', firstName: 'A' },
      });

      await expect(
        service.updateOrderStatus('order-1', OrderStatus.FULFILLED),
      ).rejects.toThrow(BadRequestException);

      (prisma.order.findUnique as jest.Mock).mockResolvedValue({
        id: 'order-1',
        status: OrderStatus.FULFILLED,
        items: [],
        user: { id: 'user-1', email: 'a@b.com', firstName: 'A' },
      });

      await expect(
        service.updateOrderStatus('order-1', OrderStatus.DELIVERED),
      ).rejects.toThrow(/shipment lifecycle/);
    });
  });
});
