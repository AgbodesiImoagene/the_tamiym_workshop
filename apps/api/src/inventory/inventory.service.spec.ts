import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { InventoryService } from './inventory.service';
import { PrismaService } from '../prisma/prisma.service';

const mockVariant = {
  id: 'var-1',
  productId: 'prod-1',
  name: 'Small / Red',
  sku: 'SKU-S-RED',
  isAvailable: true,
  product: { id: 'prod-1', name: 'Tee', slug: 'tee' },
  inventory: {
    id: 'inv-1',
    variantId: 'var-1',
    stockOnHand: 50,
    reserved: 2,
    trackInventory: true,
    lowStockThreshold: 10,
    updatedAt: new Date(),
    createdAt: new Date(),
  },
};

describe('InventoryService', () => {
  let service: InventoryService;
  let prisma: jest.Mocked<PrismaService>;

  beforeEach(async () => {
    const mockPrisma = {
      productVariant: {
        findUnique: jest.fn(),
        update: jest.fn(),
      },
      inventoryItem: {
        findUnique: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        InventoryService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<InventoryService>(InventoryService);
    prisma = module.get(PrismaService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('getByVariantId', () => {
    it('should return variant with inventory', async () => {
      (prisma.productVariant.findUnique as jest.Mock).mockResolvedValue(
        mockVariant,
      );

      const result = await service.getByVariantId('var-1');

      expect(prisma.productVariant.findUnique).toHaveBeenCalledWith({
        where: { id: 'var-1' },
        include: expect.any(Object),
      });
      expect(result.variantId).toBe('var-1');
      expect(result.inventory.stockOnHand).toBe(50);
    });

    it('should return synthetic inventory when variant has no InventoryItem', async () => {
      (prisma.productVariant.findUnique as jest.Mock).mockResolvedValue({
        ...mockVariant,
        inventory: null,
        updatedAt: new Date(),
        createdAt: new Date(),
      });

      const result = await service.getByVariantId('var-1');

      expect(result.inventory).toBeDefined();
      expect(result.inventory.stockOnHand).toBe(0);
      expect(result.inventory.reserved).toBe(0);
    });

    it('should throw NotFoundException when variant not found', async () => {
      (prisma.productVariant.findUnique as jest.Mock).mockResolvedValue(null);

      await expect(service.getByVariantId('invalid')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('updateVariantInventory', () => {
    it('should update existing inventory item', async () => {
      (prisma.productVariant.findUnique as jest.Mock).mockResolvedValue(
        mockVariant,
      );
      (prisma.inventoryItem.update as jest.Mock).mockResolvedValue({});
      (prisma.productVariant.findUnique as jest.Mock)
        .mockResolvedValueOnce(mockVariant)
        .mockResolvedValueOnce(mockVariant);

      const result = await service.updateVariantInventory('var-1', {
        stockOnHand: 100,
      });

      expect(prisma.inventoryItem.update).toHaveBeenCalledWith({
        where: { id: 'inv-1' },
        data: { stockOnHand: 100 },
      });
      expect(result).toBeDefined();
    });

    it('should create inventory item when variant has none', async () => {
      (prisma.productVariant.findUnique as jest.Mock)
        .mockResolvedValueOnce({
          ...mockVariant,
          inventory: null,
        })
        .mockResolvedValueOnce({
          ...mockVariant,
          inventory: {
            id: 'inv-new',
            variantId: 'var-1',
            stockOnHand: 20,
            reserved: 0,
            trackInventory: true,
            lowStockThreshold: 0,
            updatedAt: new Date(),
            createdAt: new Date(),
          },
        });
      (prisma.inventoryItem.create as jest.Mock).mockResolvedValue({});

      await service.updateVariantInventory('var-1', {
        stockOnHand: 20,
      });

      expect(prisma.inventoryItem.create).toHaveBeenCalledWith({
        data: {
          variantId: 'var-1',
          stockOnHand: 20,
          reserved: 0,
          lowStockThreshold: 0,
          trackInventory: true,
        },
      });
    });

    it('should update variant isAvailable when provided', async () => {
      (prisma.productVariant.findUnique as jest.Mock)
        .mockResolvedValueOnce(mockVariant)
        .mockResolvedValueOnce(mockVariant);
      (prisma.inventoryItem.update as jest.Mock).mockResolvedValue({});

      await service.updateVariantInventory('var-1', { isAvailable: false });

      expect(prisma.productVariant.update).toHaveBeenCalledWith({
        where: { id: 'var-1' },
        data: { isAvailable: false },
      });
    });

    it('should throw NotFoundException when variant not found', async () => {
      (prisma.productVariant.findUnique as jest.Mock).mockResolvedValue(null);

      await expect(
        service.updateVariantInventory('invalid', { stockOnHand: 10 }),
      ).rejects.toThrow(NotFoundException);
    });
  });
});
