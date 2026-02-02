import { Test, TestingModule } from '@nestjs/testing';
import {
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { ProductsService } from './products.service';
import { PrismaService } from '../prisma/prisma.service';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { CreateVariantDto } from './dto/create-variant.dto';
import { ProductStatus } from '../generated/prisma/enums';

const mockProduct = {
  id: 'prod-1',
  categoryId: 'cat-1',
  name: 'Classic Tee',
  slug: 'classic-tee',
  description: 'Soft cotton',
  status: ProductStatus.ACTIVE,
  defaultCurrency: 'NGN',
  createdAt: new Date(),
  updatedAt: new Date(),
};

const mockVariant = {
  id: 'var-1',
  productId: 'prod-1',
  name: 'Small / Red',
  sku: 'SKU-S-RED',
  size: 'S',
  color: 'Red',
  priceOverride: null,
  isAvailable: true,
  createdAt: new Date(),
  updatedAt: new Date(),
};

describe('ProductsService', () => {
  let service: ProductsService;
  let prisma: jest.Mocked<PrismaService>;

  beforeEach(async () => {
    const mockPrisma = {
      product: {
        findMany: jest.fn(),
        findUnique: jest.fn(),
        findFirst: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
      },
      category: {
        findUnique: jest.fn(),
      },
      productVariant: {
        findUnique: jest.fn(),
        findFirst: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ProductsService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<ProductsService>(ProductsService);
    prisma = module.get(PrismaService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('findAll', () => {
    it('should return products with ACTIVE status', async () => {
      (prisma.product.findMany as jest.Mock).mockResolvedValue([mockProduct]);

      const result = await service.findAll();

      expect(prisma.product.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ status: ProductStatus.ACTIVE }),
        }),
      );
      expect(result).toEqual([mockProduct]);
    });

    it('should filter by categoryId when provided', async () => {
      (prisma.product.findMany as jest.Mock).mockResolvedValue([]);

      await service.findAll({ categoryId: 'cat-1' });

      expect(prisma.product.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ categoryId: 'cat-1' }),
        }),
      );
    });
  });

  describe('findOne', () => {
    it('should return a product by id', async () => {
      (prisma.product.findUnique as jest.Mock).mockResolvedValue(mockProduct);

      const result = await service.findOne('prod-1');

      expect(prisma.product.findUnique).toHaveBeenCalledWith({
        where: { id: 'prod-1' },
        include: expect.any(Object),
      });
      expect(result.id).toBe('prod-1');
    });

    it('should throw NotFoundException when product not found', async () => {
      (prisma.product.findUnique as jest.Mock).mockResolvedValue(null);

      await expect(service.findOne('invalid')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('create', () => {
    it('should create a product', async () => {
      (prisma.category.findUnique as jest.Mock).mockResolvedValue({
        id: 'cat-1',
      });
      (prisma.product.findUnique as jest.Mock).mockResolvedValue(null);
      (prisma.product.create as jest.Mock).mockResolvedValue(mockProduct);

      const dto: CreateProductDto = {
        categoryId: 'cat-1',
        name: 'Classic Tee',
      };
      const result = await service.create(dto);

      expect(prisma.product.create).toHaveBeenCalled();
      expect(result).toEqual(mockProduct);
    });

    it('should throw BadRequestException when category not found', async () => {
      (prisma.category.findUnique as jest.Mock).mockResolvedValue(null);

      const dto: CreateProductDto = {
        categoryId: 'invalid',
        name: 'Classic Tee',
      };

      await expect(service.create(dto)).rejects.toThrow(BadRequestException);
    });

    it('should throw ConflictException when slug exists', async () => {
      (prisma.category.findUnique as jest.Mock).mockResolvedValue({
        id: 'cat-1',
      });
      (prisma.product.findUnique as jest.Mock).mockResolvedValue(mockProduct);

      const dto: CreateProductDto = {
        categoryId: 'cat-1',
        name: 'Classic Tee',
      };

      await expect(service.create(dto)).rejects.toThrow(ConflictException);
    });
  });

  describe('update', () => {
    it('should update a product', async () => {
      (prisma.product.findUnique as jest.Mock).mockResolvedValue(mockProduct);
      (prisma.product.findFirst as jest.Mock).mockResolvedValue(null);
      (prisma.product.update as jest.Mock).mockResolvedValue({
        ...mockProduct,
        name: 'Updated',
      });

      const dto: UpdateProductDto = { name: 'Updated' };
      const result = await service.update('prod-1', dto);

      expect(prisma.product.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'prod-1' },
          data: expect.objectContaining({ name: 'Updated' }),
        }),
      );
      expect(result.name).toBe('Updated');
    });

    it('should throw NotFoundException when product not found', async () => {
      (prisma.product.findUnique as jest.Mock).mockResolvedValue(null);

      await expect(service.update('invalid', { name: 'X' })).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('remove', () => {
    it('should delete a product', async () => {
      (prisma.product.findUnique as jest.Mock).mockResolvedValue(mockProduct);
      (prisma.product.delete as jest.Mock).mockResolvedValue(mockProduct);

      const result = await service.remove('prod-1');

      expect(prisma.product.delete).toHaveBeenCalledWith({
        where: { id: 'prod-1' },
      });
      expect(result).toEqual(mockProduct);
    });
  });

  describe('addVariant', () => {
    it('should add a variant to a product', async () => {
      (prisma.product.findUnique as jest.Mock).mockResolvedValue(mockProduct);
      (prisma.productVariant.findUnique as jest.Mock).mockResolvedValue(null);
      (prisma.productVariant.create as jest.Mock).mockResolvedValue(
        mockVariant,
      );

      const dto: CreateVariantDto = {
        name: 'Small / Red',
        sku: 'SKU-S-RED',
      };
      const result = await service.addVariant('prod-1', dto);

      expect(prisma.productVariant.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          productId: 'prod-1',
          name: 'Small / Red',
          sku: 'SKU-S-RED',
          isAvailable: true,
        }),
      });
      expect(result).toEqual(mockVariant);
    });

    it('should throw NotFoundException when product not found', async () => {
      (prisma.product.findUnique as jest.Mock).mockResolvedValue(null);

      await expect(
        service.addVariant('invalid', { name: 'S', sku: 'SKU-S' }),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw ConflictException when SKU exists', async () => {
      (prisma.product.findUnique as jest.Mock).mockResolvedValue(mockProduct);
      (prisma.productVariant.findUnique as jest.Mock).mockResolvedValue(
        mockVariant,
      );

      await expect(
        service.addVariant('prod-1', { name: 'S', sku: 'SKU-S-RED' }),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('updateVariant', () => {
    it('should update a variant', async () => {
      (prisma.productVariant.findUnique as jest.Mock).mockResolvedValue(
        mockVariant,
      );
      (prisma.productVariant.findFirst as jest.Mock).mockResolvedValue(null);
      (prisma.productVariant.update as jest.Mock).mockResolvedValue({
        ...mockVariant,
        name: 'Updated',
      });

      const result = await service.updateVariant('var-1', { name: 'Updated' });

      expect(prisma.productVariant.update).toHaveBeenCalledWith({
        where: { id: 'var-1' },
        data: expect.objectContaining({ name: 'Updated' }),
      });
      expect(result.name).toBe('Updated');
    });

    it('should throw NotFoundException when variant not found', async () => {
      (prisma.productVariant.findUnique as jest.Mock).mockResolvedValue(null);

      await expect(
        service.updateVariant('invalid', { name: 'X' }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('removeVariant', () => {
    it('should delete a variant', async () => {
      (prisma.productVariant.findUnique as jest.Mock).mockResolvedValue(
        mockVariant,
      );
      (prisma.productVariant.delete as jest.Mock).mockResolvedValue(
        mockVariant,
      );

      const result = await service.removeVariant('var-1');

      expect(prisma.productVariant.delete).toHaveBeenCalledWith({
        where: { id: 'var-1' },
      });
      expect(result).toEqual(mockVariant);
    });
  });
});
