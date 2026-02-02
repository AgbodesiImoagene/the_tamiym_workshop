import { Test, TestingModule } from '@nestjs/testing';
import {
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { OrdersService } from './orders.service';
import { PrismaService } from '../prisma/prisma.service';
import { CreateOrderDto } from './dto/create-order.dto';
import { OrderStatus, PaymentStatus } from '../generated/prisma/enums';

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

const mockVariant = {
  id: 'var-1',
  productId: 'prod-1',
  name: 'S / Red',
  sku: 'SKU-S-RED',
  isAvailable: true,
  priceOverride: 5000,
  prices: [],
};

const mockOrder = {
  id: 'order-1',
  userId: 'user-1',
  status: OrderStatus.PENDING_PAYMENT,
  paymentStatus: PaymentStatus.PENDING,
  totalAmount: 10000,
  items: [],
};

describe('OrdersService', () => {
  let service: OrdersService;
  let prisma: jest.Mocked<PrismaService>;

  beforeEach(async () => {
    const mockPrisma = {
      address: { findUnique: jest.fn() },
      productVariant: { findUnique: jest.fn() },
      productPrice: { findFirst: jest.fn() },
      order: { create: jest.fn(), findMany: jest.fn(), findUnique: jest.fn() },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OrdersService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<OrdersService>(OrdersService);
    prisma = module.get(PrismaService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('create', () => {
    it('should create an order', async () => {
      (prisma.address.findUnique as jest.Mock).mockResolvedValue(mockAddress);
      (prisma.productVariant.findUnique as jest.Mock).mockResolvedValue(
        mockVariant,
      );
      (prisma.order.create as jest.Mock).mockResolvedValue(mockOrder);

      const dto: CreateOrderDto = {
        shippingAddressId: 'addr-1',
        items: [{ productId: 'prod-1', variantId: 'var-1', quantity: 2 }],
      };
      const result = await service.create('user-1', dto);

      expect(prisma.order.create).toHaveBeenCalled();
      expect(result).toEqual(mockOrder);
    });

    it('should throw NotFoundException when address not found', async () => {
      (prisma.address.findUnique as jest.Mock).mockResolvedValue(null);

      const dto: CreateOrderDto = {
        shippingAddressId: 'invalid',
        items: [{ productId: 'prod-1', variantId: 'var-1', quantity: 1 }],
      };

      await expect(service.create('user-1', dto)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should throw ForbiddenException when address belongs to another user', async () => {
      (prisma.address.findUnique as jest.Mock).mockResolvedValue(mockAddress);

      const dto: CreateOrderDto = {
        shippingAddressId: 'addr-1',
        items: [{ productId: 'prod-1', variantId: 'var-1', quantity: 1 }],
      };

      await expect(service.create('other-user', dto)).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('should throw BadRequestException when items empty', async () => {
      (prisma.address.findUnique as jest.Mock).mockResolvedValue(mockAddress);

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

      expect(result).toEqual(mockOrder);
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
});
