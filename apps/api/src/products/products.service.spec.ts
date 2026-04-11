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
import { ProductSort } from './dto/products-query.dto';
import { ProductStatus } from '../generated/prisma/enums';
import { ImageRole } from '../generated/prisma/enums';
import { TemplateEffectType } from '../generated/prisma/enums';
import { TemplateLayerType } from '../generated/prisma/enums';
import {
  DEFAULT_CURRENCY,
  MAX_OPTIONS_PER_PRODUCT,
  MAX_VARIANTS_PER_PRODUCT,
} from '../constants';
import { MediaService } from '../media/media.service';

const mockProduct = {
  id: 'prod-1',
  categoryId: 'cat-1',
  name: 'Classic Tee',
  slug: 'classic-tee',
  description: 'Soft cotton',
  status: ProductStatus.ACTIVE,
  createdAt: new Date(),
  updatedAt: new Date(),
  options: [],
  variants: [],
  prices: [],
  images: [],
  productImageRoles: [],
  views: [],
};

const mockVariant = {
  id: 'var-1',
  productId: 'prod-1',
  name: 'Small / Red',
  sku: 'SKU-S-RED',
  isAvailable: true,
  createdAt: new Date(),
  updatedAt: new Date(),
  orderItems: [],
};

const makeOptionValues = (count: number) =>
  Array.from({ length: count }, (_, i) => ({
    id: `val-${i}`,
    valueCode: `V${i}`,
    displayName: `Value ${i}`,
  }));

describe('ProductsService', () => {
  let service: ProductsService;
  let prisma: jest.Mocked<PrismaService>;
  let mediaService: jest.Mocked<MediaService>;

  beforeEach(async () => {
    const mockPrisma: jest.Mocked<PrismaService> = {
      $transaction: jest.fn((cb: (tx: unknown) => Promise<unknown>) =>
        cb(mockPrisma),
      ),
      product: {
        findMany: jest.fn(),
        findUnique: jest.fn(),
        findFirst: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn(),
        delete: jest.fn(),
      },
      category: {
        findUnique: jest.fn(),
      },
      productVariant: {
        findUnique: jest.fn(),
        findFirst: jest.fn(),
        create: jest.fn().mockResolvedValue({ id: 'new-var-id' }),
        update: jest.fn(),
        updateMany: jest.fn(),
        delete: jest.fn(),
        deleteMany: jest.fn(),
      },
      productOption: {
        findUnique: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
      },
      productOptionValue: {
        findUnique: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
      },
      productImage: {
        findUnique: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
      },
      productImageRole: {
        findUnique: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
      },
      productView: {
        findUnique: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn(),
        delete: jest.fn(),
      },
      printArea: {
        upsert: jest.fn(),
      },
      workshopTemplateLayer: {
        findUnique: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
      },
      optionValueTemplateEffect: {
        findUnique: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
      },
      productPrice: {
        findUnique: jest.fn(),
        upsert: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
      },
      variantPrice: {
        findUnique: jest.fn(),
        upsert: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
      },
      variantOptionValue: {
        createMany: jest.fn(),
      },
      orderItem: {
        findFirst: jest.fn().mockResolvedValue(null),
      },
      mediaAsset: {
        findUnique: jest.fn(),
      },
    } as unknown as jest.Mocked<PrismaService>;
    const mockMediaService = {
      createAssetFromUpload: jest.fn(),
      createAssetFromUrl: jest.fn(),
    } as unknown as jest.Mocked<MediaService>;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ProductsService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: MediaService, useValue: mockMediaService },
      ],
    }).compile();

    service = module.get<ProductsService>(ProductsService);
    prisma = module.get(PrismaService);
    mediaService = module.get(MediaService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('findAll', () => {
    it('should return products with ACTIVE status and slim include (no variants)', async () => {
      const slimProduct = {
        ...mockProduct,
        prices: [{ amount: 5000, currency: 'NGN', compareAt: null }],
        productImageRoles: [],
      };
      (prisma.product.findMany as jest.Mock).mockResolvedValue([slimProduct]);

      const result = await service.findAll();

      expect(prisma.product.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ status: ProductStatus.ACTIVE }),
          include: expect.objectContaining({
            category: { select: { id: true, name: true, slug: true } },
            prices: expect.any(Object),
            productImageRoles: expect.any(Object),
          }),
        }),
      );
      expect(prisma.product.findMany).not.toHaveBeenCalledWith(
        expect.objectContaining({
          include: expect.objectContaining({ variants: expect.anything() }),
        }),
      );
      expect(result).toEqual([slimProduct]);
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

    it('should resolve categorySlug to categoryId when categoryId not set', async () => {
      (prisma.category.findUnique as jest.Mock).mockResolvedValue({
        id: 'cat-2',
      });
      (prisma.product.findMany as jest.Mock).mockResolvedValue([]);

      await service.findAll({ categorySlug: 'hoodies' });

      expect(prisma.category.findUnique).toHaveBeenCalledWith({
        where: { slug: 'hoodies' },
        select: { id: true },
      });
      expect(prisma.product.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ categoryId: 'cat-2' }),
        }),
      );
    });

    it('should add full-text search filter (name and description) when search provided', async () => {
      (prisma.product.findMany as jest.Mock).mockResolvedValue([]);

      await service.findAll({ search: 'tee' });

      expect(prisma.product.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            OR: [
              { name: { search: 'tee' } },
              { description: { search: 'tee' } },
            ],
          }),
        }),
      );
    });

    it('should format multi-word search as OR for FTS (e.g. "blue tee" -> "blue | tee")', async () => {
      (prisma.product.findMany as jest.Mock).mockResolvedValue([]);

      await service.findAll({ search: 'blue tee' });

      expect(prisma.product.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            OR: [
              { name: { search: 'blue | tee' } },
              { description: { search: 'blue | tee' } },
            ],
          }),
        }),
      );
    });

    it('should apply price range and onSale in prices filter', async () => {
      (prisma.product.findMany as jest.Mock).mockResolvedValue([]);

      await service.findAll({
        minPrice: 1000,
        maxPrice: 10000,
        onSale: true,
      });

      expect(prisma.product.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            prices: {
              some: expect.objectContaining({
                currency: 'NGN',
                amount: { gte: 1000, lte: 10000 },
                compareAt: { not: null },
              }),
            },
          }),
        }),
      );
    });

    it('should apply sort and pagination (take/skip)', async () => {
      (prisma.product.findMany as jest.Mock).mockResolvedValue([]);

      await service.findAll({
        sort: ProductSort.NAME_ASC,
        limit: 10,
        offset: 20,
      });

      expect(prisma.product.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          orderBy: { name: 'asc' },
          take: 10,
          skip: 20,
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

    it('should include inventory-derived inStock and availableQuantity', async () => {
      (prisma.product.findUnique as jest.Mock).mockResolvedValue({
        id: 'prod-1',
        category: { id: 'cat-1', name: 'Category', slug: 'cat-1' },
        options: [],
        variants: [
          {
            id: 'var-1',
            name: 'S',
            sku: 'SKU-S',
            isAvailable: true,
            inventory: { stockOnHand: 10, reserved: 2, trackInventory: true },
            optionValues: [],
            prices: [{ currency: 'NGN', amount: 5000, compareAt: null }],
          },
          {
            id: 'var-2',
            name: 'M',
            sku: 'SKU-M',
            isAvailable: true,
            inventory: { stockOnHand: 0, reserved: 0, trackInventory: true },
            optionValues: [],
            prices: [],
          },
          {
            id: 'var-3',
            name: 'L',
            sku: 'SKU-L',
            isAvailable: true,
            inventory: { stockOnHand: 0, reserved: 0, trackInventory: false },
            optionValues: [],
            prices: [],
          },
          {
            id: 'var-4',
            name: 'XL',
            sku: 'SKU-XL',
            isAvailable: true,
            inventory: null,
            optionValues: [],
            prices: [],
          },
        ],
        prices: [{ currency: 'NGN', amount: 5000, compareAt: null }],
        images: [],
        productImageRoles: [],
        views: [],
      });

      const result = await service.findOne('prod-1');
      const variants = result.variants as Array<{
        id: string;
        inStock: boolean;
        availableQuantity: number | null;
      }>;
      const variantMap = new Map(variants.map((v) => [v.id, v]));

      expect(variantMap.get('var-1')?.inStock).toBe(true);
      expect(variantMap.get('var-1')?.availableQuantity).toBe(8);
      expect(variantMap.get('var-2')?.inStock).toBe(false);
      expect(variantMap.get('var-2')?.availableQuantity).toBe(0);
      expect(variantMap.get('var-3')?.inStock).toBe(true);
      expect(variantMap.get('var-3')?.availableQuantity).toBeNull();
      expect(variantMap.get('var-4')?.inStock).toBe(true);
      expect(variantMap.get('var-4')?.availableQuantity).toBeNull();
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
      (prisma.productVariant.findUnique as jest.Mock).mockResolvedValue({
        ...mockVariant,
        orderItems: [],
      });
      (prisma.productVariant.delete as jest.Mock).mockResolvedValue(
        mockVariant,
      );

      const result = await service.removeVariant('var-1');

      expect(prisma.productVariant.delete).toHaveBeenCalledWith({
        where: { id: 'var-1' },
      });
      expect(result).toEqual(mockVariant);
    });

    it('should throw BadRequestException when variant has orders', async () => {
      (prisma.productVariant.findUnique as jest.Mock).mockResolvedValue({
        ...mockVariant,
        orderItems: [{ id: 'oi-1' }],
      });

      await expect(service.removeVariant('var-1')).rejects.toThrow(
        BadRequestException,
      );
      await expect(service.removeVariant('var-1')).rejects.toThrow(
        'Variant has orders and cannot be deleted',
      );
      expect(prisma.productVariant.delete).not.toHaveBeenCalled();
    });
  });

  describe('createOption', () => {
    it('should create an option and trigger variant regeneration', async () => {
      (prisma.product.findUnique as jest.Mock)
        .mockResolvedValueOnce({ id: 'prod-1', options: [] })
        .mockResolvedValueOnce({
          id: 'prod-1',
          slug: 'test-product',
          options: [],
          variants: [],
        });
      (prisma.productOption.create as jest.Mock).mockResolvedValue({
        id: 'opt-1',
        productId: 'prod-1',
        code: 'size',
        name: 'Size',
        sortOrder: 0,
      });

      const result = await service.createOption('prod-1', {
        code: 'size',
        name: 'Size',
        sortOrder: 0,
      });

      expect(prisma.productOption.create).toHaveBeenCalledWith({
        data: {
          productId: 'prod-1',
          code: 'size',
          name: 'Size',
          sortOrder: 0,
        },
      });
      expect(prisma.$transaction).toHaveBeenCalled();
      expect(result.code).toBe('size');
    });

    it('should throw BadRequestException when max options exceeded', async () => {
      (prisma.product.findUnique as jest.Mock).mockResolvedValue({
        id: 'prod-1',
        options: Array.from({ length: MAX_OPTIONS_PER_PRODUCT }, (_, i) => ({
          id: `opt-${i}`,
        })),
      });

      await expect(
        service.createOption('prod-1', { code: 'size', name: 'Size' }),
      ).rejects.toThrow(BadRequestException);
      expect(prisma.productOption.create).not.toHaveBeenCalled();
    });

    it('should throw NotFoundException when product not found', async () => {
      (prisma.product.findUnique as jest.Mock).mockResolvedValue(null);

      await expect(
        service.createOption('invalid', { code: 'size', name: 'Size' }),
      ).rejects.toThrow(NotFoundException);
      expect(prisma.productOption.create).not.toHaveBeenCalled();
    });
  });

  describe('updateOption', () => {
    it('should update an option and trigger variant regeneration', async () => {
      (prisma.productOption.findUnique as jest.Mock).mockResolvedValue({
        id: 'opt-1',
        productId: 'prod-1',
      });
      (prisma.productOption.update as jest.Mock).mockResolvedValue({
        id: 'opt-1',
        productId: 'prod-1',
        code: 'size',
        name: 'Size Updated',
        sortOrder: 0,
      });
      (prisma.product.findUnique as jest.Mock).mockResolvedValue({
        id: 'prod-1',
        slug: 'test-product',
        options: [{ id: 'opt-1', values: [] }],
        variants: [],
      });

      const result = await service.updateOption('prod-1', 'opt-1', {
        name: 'Size Updated',
      });

      expect(prisma.productOption.update).toHaveBeenCalledWith({
        where: { id: 'opt-1' },
        data: expect.objectContaining({ name: 'Size Updated' }),
      });
      expect(prisma.$transaction).toHaveBeenCalled();
      expect(result.name).toBe('Size Updated');
    });

    it('should throw BadRequestException when variant combinations exceed limit', async () => {
      const valueCount = Math.ceil(Math.sqrt(MAX_VARIANTS_PER_PRODUCT + 1));
      (prisma.productOption.findUnique as jest.Mock).mockResolvedValue({
        id: 'opt-1',
        productId: 'prod-1',
      });
      (prisma.productOption.update as jest.Mock).mockResolvedValue({
        id: 'opt-1',
        productId: 'prod-1',
      });
      (prisma.product.findUnique as jest.Mock).mockResolvedValue({
        id: 'prod-1',
        slug: 'test-product',
        options: [
          { id: 'opt-1', values: makeOptionValues(valueCount) },
          { id: 'opt-2', values: makeOptionValues(valueCount) },
        ],
        variants: [],
      });

      await expect(
        service.updateOption('prod-1', 'opt-1', { name: 'Size Updated' }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw NotFoundException when option not found', async () => {
      (prisma.productOption.findUnique as jest.Mock).mockResolvedValue(null);

      await expect(
        service.updateOption('prod-1', 'invalid', { name: 'X' }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('deleteOption', () => {
    it('should delete an option and trigger variant regeneration', async () => {
      (prisma.productOption.findUnique as jest.Mock).mockResolvedValue({
        id: 'opt-1',
        productId: 'prod-1',
      });
      (prisma.productOption.delete as jest.Mock).mockResolvedValue(undefined);
      (prisma.product.findUnique as jest.Mock).mockResolvedValue({
        id: 'prod-1',
        slug: 'test-product',
        options: [],
        variants: [],
      });

      await service.deleteOption('prod-1', 'opt-1');

      expect(prisma.productOption.delete).toHaveBeenCalledWith({
        where: { id: 'opt-1' },
      });
      expect(prisma.$transaction).toHaveBeenCalled();
    });

    it('should throw NotFoundException when option not found', async () => {
      (prisma.productOption.findUnique as jest.Mock).mockResolvedValue(null);

      await expect(service.deleteOption('prod-1', 'invalid')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('createOptionValue', () => {
    it('should create an option value and trigger variant regeneration', async () => {
      (prisma.productOption.findUnique as jest.Mock).mockResolvedValue({
        id: 'opt-1',
        productId: 'prod-1',
      });
      (prisma.productOptionValue.create as jest.Mock).mockResolvedValue({
        id: 'val-1',
        optionId: 'opt-1',
        valueCode: 'L',
        displayName: 'Large',
        sortOrder: 0,
      });
      (prisma.product.findUnique as jest.Mock).mockResolvedValue({
        id: 'prod-1',
        slug: 'test-product',
        options: [
          {
            id: 'opt-1',
            values: [
              {
                id: 'val-1',
                valueCode: 'L',
                displayName: 'Large',
                optionId: 'opt-1',
              },
            ],
          },
        ],
        variants: [],
      });

      const result = await service.createOptionValue('prod-1', 'opt-1', {
        valueCode: 'L',
        displayName: 'Large',
        sortOrder: 0,
      });

      expect(prisma.productOptionValue.create).toHaveBeenCalled();
      expect(prisma.$transaction).toHaveBeenCalled();
      expect(result.valueCode).toBe('L');
    });

    it('should throw NotFoundException when option not found', async () => {
      (prisma.productOption.findUnique as jest.Mock).mockResolvedValue(null);

      await expect(
        service.createOptionValue('prod-1', 'invalid', {
          valueCode: 'L',
          displayName: 'Large',
        }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('updateOptionValue', () => {
    it('should update an option value and trigger variant regeneration', async () => {
      (prisma.productOptionValue.findUnique as jest.Mock).mockResolvedValue({
        id: 'val-1',
        option: { productId: 'prod-1' },
      });
      (prisma.productOptionValue.update as jest.Mock).mockResolvedValue({
        id: 'val-1',
        valueCode: 'L',
        displayName: 'Large Updated',
      });
      (prisma.product.findUnique as jest.Mock).mockResolvedValue({
        id: 'prod-1',
        slug: 'test-product',
        options: [{ id: 'opt-1', values: [] }],
        variants: [],
      });

      const result = await service.updateOptionValue('prod-1', 'val-1', {
        displayName: 'Large Updated',
      });

      expect(prisma.productOptionValue.update).toHaveBeenCalled();
      expect(prisma.$transaction).toHaveBeenCalled();
      expect(result.displayName).toBe('Large Updated');
    });

    it('should throw NotFoundException when option value not found', async () => {
      (prisma.productOptionValue.findUnique as jest.Mock).mockResolvedValue(
        null,
      );

      await expect(
        service.updateOptionValue('prod-1', 'invalid', { displayName: 'X' }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('deleteOptionValue', () => {
    it('should delete an option value and trigger variant regeneration', async () => {
      (prisma.productOptionValue.findUnique as jest.Mock).mockResolvedValue({
        id: 'val-1',
        option: { productId: 'prod-1' },
      });
      (prisma.productOptionValue.delete as jest.Mock).mockResolvedValue(
        undefined,
      );
      (prisma.product.findUnique as jest.Mock).mockResolvedValue({
        id: 'prod-1',
        slug: 'test-product',
        options: [],
        variants: [],
      });

      await service.deleteOptionValue('prod-1', 'val-1');

      expect(prisma.productOptionValue.delete).toHaveBeenCalledWith({
        where: { id: 'val-1' },
      });
      expect(prisma.$transaction).toHaveBeenCalled();
    });

    it('should throw NotFoundException when option value not found', async () => {
      (prisma.productOptionValue.findUnique as jest.Mock).mockResolvedValue(
        null,
      );

      await expect(
        service.deleteOptionValue('prod-1', 'invalid'),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('createProductImage', () => {
    it('should create a product image', async () => {
      (prisma.product.findUnique as jest.Mock).mockResolvedValue({
        id: 'prod-1',
      });
      (mediaService.createAssetFromUrl as jest.Mock).mockResolvedValue({
        id: 'asset-1',
      });
      (prisma.productImage.create as jest.Mock).mockResolvedValue({
        id: 'img-1',
        productId: 'prod-1',
        mediaAssetId: 'asset-1',
        sortOrder: 0,
      });

      const result = await service.createProductImage('prod-1', {
        sourceUrl: 'https://example.com/img.png',
      });

      expect(mediaService.createAssetFromUrl).toHaveBeenCalledWith(
        'https://example.com/img.png',
      );
      expect(prisma.productImage.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          productId: 'prod-1',
          mediaAssetId: 'asset-1',
          sortOrder: 0,
        }),
      });
      expect(result.mediaAssetId).toBe('asset-1');
    });

    it('should throw BadRequestException when variant does not belong to product', async () => {
      (prisma.product.findUnique as jest.Mock).mockResolvedValue({
        id: 'prod-1',
      });
      (prisma.productVariant.findUnique as jest.Mock).mockResolvedValue({
        id: 'var-1',
        productId: 'other-prod',
      });

      await expect(
        service.createProductImage('prod-1', {
          sourceUrl: 'https://example.com/img.png',
          variantId: 'var-1',
        }),
      ).rejects.toThrow(BadRequestException);
      expect(prisma.productImage.create).not.toHaveBeenCalled();
    });
  });

  describe('uploadProductImage', () => {
    it('should enqueue ingestion and create a product image', async () => {
      (prisma.product.findUnique as jest.Mock).mockResolvedValue({
        id: 'prod-1',
      });
      (mediaService.createAssetFromUpload as jest.Mock).mockResolvedValue({
        id: 'asset-1',
      });
      (prisma.productImage.create as jest.Mock).mockResolvedValue({
        id: 'img-1',
        productId: 'prod-1',
        mediaAssetId: 'asset-1',
      });

      const file = {
        buffer: Buffer.from('raw'),
        mimetype: 'image/png',
      } as { buffer: Buffer; mimetype: string };

      const result = await service.uploadProductImage('prod-1', file, {
        altText: 'Front view',
        sortOrder: 0,
      });

      expect(mediaService.createAssetFromUpload).toHaveBeenCalledWith(file);
      expect(prisma.productImage.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          productId: 'prod-1',
          mediaAssetId: 'asset-1',
          sortOrder: 0,
          altText: 'Front view',
        }),
      });
      expect(result.mediaAssetId).toBe('asset-1');
    });
  });

  describe('updateProductImage', () => {
    it('should update a product image', async () => {
      (prisma.productImage.findUnique as jest.Mock).mockResolvedValue({
        id: 'img-1',
        productId: 'prod-1',
      });
      (prisma.productImage.update as jest.Mock).mockResolvedValue({
        id: 'img-1',
        mediaAssetId: 'asset-2',
      });
      (prisma.mediaAsset.findUnique as jest.Mock).mockResolvedValue({
        id: 'asset-2',
      });

      const result = await service.updateProductImage('img-1', {
        mediaAssetId: 'asset-2',
      });

      expect(prisma.productImage.update).toHaveBeenCalledWith({
        where: { id: 'img-1' },
        data: expect.objectContaining({
          mediaAssetId: 'asset-2',
        }),
      });
      expect(result.mediaAssetId).toBe('asset-2');
    });

    it('should throw NotFoundException when image not found', async () => {
      (prisma.productImage.findUnique as jest.Mock).mockResolvedValue(null);

      await expect(
        service.updateProductImage('invalid', { mediaAssetId: 'asset-2' }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('deleteProductImage', () => {
    it('should delete a product image', async () => {
      (prisma.productImage.findUnique as jest.Mock).mockResolvedValue({
        id: 'img-1',
        productId: 'prod-1',
      });
      (prisma.productImage.delete as jest.Mock).mockResolvedValue(undefined);

      await service.deleteProductImage('img-1');

      expect(prisma.productImage.delete).toHaveBeenCalledWith({
        where: { id: 'img-1' },
      });
    });

    it('should throw NotFoundException when image not found', async () => {
      (prisma.productImage.findUnique as jest.Mock).mockResolvedValue(null);

      await expect(service.deleteProductImage('invalid')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('createProductImageRole', () => {
    it('should create an image role', async () => {
      (prisma.product.findUnique as jest.Mock).mockResolvedValue({
        id: 'prod-1',
      });
      (prisma.productImage.findUnique as jest.Mock).mockResolvedValue({
        id: 'img-1',
        productId: 'prod-1',
      });
      (prisma.productImageRole.create as jest.Mock).mockResolvedValue({
        id: 'role-1',
        role: ImageRole.THUMBNAIL,
        sortOrder: 0,
      });

      const result = await service.createProductImageRole('prod-1', 'img-1', {
        role: ImageRole.THUMBNAIL,
        sortOrder: 0,
      });

      expect(prisma.productImageRole.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          productId: 'prod-1',
          imageId: 'img-1',
          role: ImageRole.THUMBNAIL,
          sortOrder: 0,
        }),
      });
      expect(result.role).toBe(ImageRole.THUMBNAIL);
    });

    it('should throw BadRequestException when image does not belong to product', async () => {
      (prisma.product.findUnique as jest.Mock).mockResolvedValue({
        id: 'prod-1',
      });
      (prisma.productImage.findUnique as jest.Mock).mockResolvedValue({
        id: 'img-1',
        productId: 'other-prod',
      });

      await expect(
        service.createProductImageRole('prod-1', 'img-1', {
          role: ImageRole.THUMBNAIL,
          sortOrder: 0,
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException when WORKSHOP_TEMPLATE without productViewId', async () => {
      (prisma.product.findUnique as jest.Mock).mockResolvedValue({
        id: 'prod-1',
      });
      (prisma.productImage.findUnique as jest.Mock).mockResolvedValue({
        id: 'img-1',
        productId: 'prod-1',
      });

      await expect(
        service.createProductImageRole('prod-1', 'img-1', {
          role: ImageRole.WORKSHOP_TEMPLATE,
          sortOrder: 0,
        }),
      ).rejects.toThrow(BadRequestException);
      expect(prisma.productImageRole.create).not.toHaveBeenCalled();
    });
  });

  describe('updateProductImageRole', () => {
    it('should update an image role', async () => {
      (prisma.productImageRole.findUnique as jest.Mock).mockResolvedValue({
        id: 'role-1',
        productId: 'prod-1',
      });
      (prisma.productImageRole.update as jest.Mock).mockResolvedValue({
        id: 'role-1',
        sortOrder: 1,
      });

      const result = await service.updateProductImageRole('role-1', {
        sortOrder: 1,
      });

      expect(prisma.productImageRole.update).toHaveBeenCalledWith({
        where: { id: 'role-1' },
        data: expect.objectContaining({ sortOrder: 1 }),
      });
      expect(result.sortOrder).toBe(1);
    });

    it('should throw NotFoundException when role not found', async () => {
      (prisma.productImageRole.findUnique as jest.Mock).mockResolvedValue(null);

      await expect(
        service.updateProductImageRole('invalid', { sortOrder: 1 }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('deleteProductImageRole', () => {
    it('should delete an image role', async () => {
      (prisma.productImageRole.findUnique as jest.Mock).mockResolvedValue({
        id: 'role-1',
      });
      (prisma.productImageRole.delete as jest.Mock).mockResolvedValue(
        undefined,
      );

      await service.deleteProductImageRole('role-1');

      expect(prisma.productImageRole.delete).toHaveBeenCalledWith({
        where: { id: 'role-1' },
      });
    });

    it('should throw NotFoundException when role not found', async () => {
      (prisma.productImageRole.findUnique as jest.Mock).mockResolvedValue(null);

      await expect(service.deleteProductImageRole('invalid')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('createProductView', () => {
    it('should create a product view', async () => {
      (prisma.product.findUnique as jest.Mock).mockResolvedValue({
        id: 'prod-1',
      });
      (prisma.productView.create as jest.Mock).mockResolvedValue({
        id: 'view-1',
        productId: 'prod-1',
        key: 'front',
        displayName: 'Front',
        sortOrder: 0,
        isDesignable: true,
        isDefault: false,
      });

      const result = await service.createProductView('prod-1', {
        key: 'front',
        displayName: 'Front',
      });

      expect(prisma.productView.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          productId: 'prod-1',
          key: 'front',
          displayName: 'Front',
          sortOrder: 0,
          isDesignable: true,
          isDefault: false,
        }),
      });
      expect(result.key).toBe('front');
    });

    it('should set isDefault and clear other views default', async () => {
      (prisma.product.findUnique as jest.Mock).mockResolvedValue({
        id: 'prod-1',
      });
      (prisma.productView.create as jest.Mock).mockResolvedValue({
        id: 'view-1',
        productId: 'prod-1',
        isDefault: true,
      });
      (prisma.productView.updateMany as jest.Mock).mockResolvedValue(undefined);

      await service.createProductView('prod-1', {
        key: 'front',
        displayName: 'Front',
        isDefault: true,
      });

      expect(prisma.productView.updateMany).toHaveBeenCalledWith({
        where: { productId: 'prod-1', id: { not: 'view-1' } },
        data: { isDefault: false },
      });
    });
  });

  describe('updateProductView', () => {
    it('should update a product view', async () => {
      (prisma.productView.findUnique as jest.Mock).mockResolvedValue({
        id: 'view-1',
        productId: 'prod-1',
      });
      (prisma.productView.update as jest.Mock).mockResolvedValue({
        id: 'view-1',
        displayName: 'Front Updated',
      });

      const result = await service.updateProductView('view-1', {
        displayName: 'Front Updated',
      });

      expect(prisma.productView.update).toHaveBeenCalledWith({
        where: { id: 'view-1' },
        data: expect.objectContaining({ displayName: 'Front Updated' }),
      });
      expect(result.displayName).toBe('Front Updated');
    });

    it('should throw NotFoundException when view not found', async () => {
      (prisma.productView.findUnique as jest.Mock).mockResolvedValue(null);

      await expect(
        service.updateProductView('invalid', { displayName: 'X' }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('deleteProductView', () => {
    it('should delete a product view', async () => {
      (prisma.productView.findUnique as jest.Mock).mockResolvedValue({
        id: 'view-1',
        productId: 'prod-1',
      });
      (prisma.productView.delete as jest.Mock).mockResolvedValue(undefined);

      await service.deleteProductView('view-1');

      expect(prisma.productView.delete).toHaveBeenCalledWith({
        where: { id: 'view-1' },
      });
    });

    it('should throw NotFoundException when view not found', async () => {
      (prisma.productView.findUnique as jest.Mock).mockResolvedValue(null);

      await expect(service.deleteProductView('invalid')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('upsertPrintArea', () => {
    it('should upsert a print area', async () => {
      (prisma.productView.findUnique as jest.Mock).mockResolvedValue({
        id: 'view-1',
        productId: 'prod-1',
      });
      (prisma.printArea.upsert as jest.Mock).mockResolvedValue({
        productId: 'prod-1',
        productViewId: 'view-1',
        x: 0,
        y: 0,
        width: 100,
        height: 100,
      });

      const result = await service.upsertPrintArea('prod-1', 'view-1', {
        width: 100,
        height: 100,
      });

      expect(prisma.printArea.upsert).toHaveBeenCalledWith({
        where: {
          productId_productViewId: {
            productId: 'prod-1',
            productViewId: 'view-1',
          },
        },
        create: expect.objectContaining({
          productId: 'prod-1',
          productViewId: 'view-1',
          width: 100,
          height: 100,
        }),
        update: expect.any(Object),
      });
      expect(result.width).toBe(100);
    });
  });

  describe('createTemplateLayer', () => {
    it('should create a template layer', async () => {
      (prisma.productView.findUnique as jest.Mock).mockResolvedValue({
        id: 'view-1',
        productId: 'prod-1',
      });
      (prisma.productImage.findUnique as jest.Mock).mockResolvedValue({
        id: 'img-1',
        productId: 'prod-1',
      });
      (prisma.workshopTemplateLayer.create as jest.Mock).mockResolvedValue({
        id: 'layer-1',
        productViewId: 'view-1',
        key: 'base',
        displayName: 'Base',
      });

      const result = await service.createTemplateLayer('prod-1', 'view-1', {
        key: 'base',
        displayName: 'Base',
        layerType: TemplateLayerType.BASE,
        imageId: 'img-1',
      });

      expect(prisma.workshopTemplateLayer.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          productId: 'prod-1',
          productViewId: 'view-1',
          key: 'base',
          displayName: 'Base',
          layerType: TemplateLayerType.BASE,
          imageId: 'img-1',
        }),
      });
      expect(result.key).toBe('base');
    });

    it('should throw BadRequestException when view not found', async () => {
      (prisma.productView.findUnique as jest.Mock).mockResolvedValue(null);

      await expect(
        service.createTemplateLayer('prod-1', 'invalid', {
          key: 'base',
          displayName: 'Base',
          layerType: TemplateLayerType.BASE,
          imageId: 'img-1',
        }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('updateTemplateLayer', () => {
    it('should update a template layer', async () => {
      (prisma.workshopTemplateLayer.findUnique as jest.Mock).mockResolvedValue({
        id: 'layer-1',
        productId: 'prod-1',
      });
      (prisma.workshopTemplateLayer.update as jest.Mock).mockResolvedValue({
        id: 'layer-1',
        displayName: 'Base Updated',
      });

      const result = await service.updateTemplateLayer('layer-1', {
        displayName: 'Base Updated',
      });

      expect(prisma.workshopTemplateLayer.update).toHaveBeenCalledWith({
        where: { id: 'layer-1' },
        data: expect.objectContaining({ displayName: 'Base Updated' }),
      });
      expect(result.displayName).toBe('Base Updated');
    });

    it('should throw NotFoundException when layer not found', async () => {
      (prisma.workshopTemplateLayer.findUnique as jest.Mock).mockResolvedValue(
        null,
      );

      await expect(
        service.updateTemplateLayer('invalid', { displayName: 'X' }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('deleteTemplateLayer', () => {
    it('should delete a template layer', async () => {
      (prisma.workshopTemplateLayer.findUnique as jest.Mock).mockResolvedValue({
        id: 'layer-1',
      });
      (prisma.workshopTemplateLayer.delete as jest.Mock).mockResolvedValue(
        undefined,
      );

      await service.deleteTemplateLayer('layer-1');

      expect(prisma.workshopTemplateLayer.delete).toHaveBeenCalledWith({
        where: { id: 'layer-1' },
      });
    });

    it('should throw NotFoundException when layer not found', async () => {
      (prisma.workshopTemplateLayer.findUnique as jest.Mock).mockResolvedValue(
        null,
      );

      await expect(service.deleteTemplateLayer('invalid')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('createTemplateEffect', () => {
    it('should create a template effect', async () => {
      (prisma.productView.findUnique as jest.Mock).mockResolvedValue({
        id: 'view-1',
        productId: 'prod-1',
      });
      (prisma.productOption.findUnique as jest.Mock).mockResolvedValue({
        id: 'opt-1',
        productId: 'prod-1',
      });
      (prisma.productOptionValue.findUnique as jest.Mock).mockResolvedValue({
        id: 'val-1',
        optionId: 'opt-1',
      });
      (prisma.workshopTemplateLayer.findUnique as jest.Mock).mockResolvedValue({
        id: 'layer-1',
        productViewId: 'view-1',
      });
      (prisma.optionValueTemplateEffect.create as jest.Mock).mockResolvedValue({
        id: 'eff-1',
        effectType: TemplateEffectType.TINT,
        tintHex: '#ff0000',
      });

      const result = await service.createTemplateEffect('prod-1', 'view-1', {
        optionId: 'opt-1',
        optionValueId: 'val-1',
        templateLayerId: 'layer-1',
        effectType: TemplateEffectType.TINT,
        tintHex: '#ff0000',
      });

      expect(prisma.optionValueTemplateEffect.create).toHaveBeenCalled();
      expect(result.effectType).toBe(TemplateEffectType.TINT);
    });

    it('should throw BadRequestException when REPLACE_IMAGE without replacementImageId', async () => {
      (prisma.productView.findUnique as jest.Mock).mockResolvedValue({
        id: 'view-1',
        productId: 'prod-1',
      });
      (prisma.productOption.findUnique as jest.Mock).mockResolvedValue({
        id: 'opt-1',
        productId: 'prod-1',
      });
      (prisma.productOptionValue.findUnique as jest.Mock).mockResolvedValue({
        id: 'val-1',
        optionId: 'opt-1',
      });
      (prisma.workshopTemplateLayer.findUnique as jest.Mock).mockResolvedValue({
        id: 'layer-1',
        productViewId: 'view-1',
      });

      await expect(
        service.createTemplateEffect('prod-1', 'view-1', {
          optionId: 'opt-1',
          optionValueId: 'val-1',
          templateLayerId: 'layer-1',
          effectType: TemplateEffectType.REPLACE_IMAGE,
        }),
      ).rejects.toThrow(BadRequestException);
      expect(prisma.optionValueTemplateEffect.create).not.toHaveBeenCalled();
    });
  });

  describe('updateTemplateEffect', () => {
    it('should update a template effect', async () => {
      (
        prisma.optionValueTemplateEffect.findUnique as jest.Mock
      ).mockResolvedValue({
        id: 'eff-1',
        productId: 'prod-1',
        productViewId: 'view-1',
        optionId: 'opt-1',
      });
      (prisma.optionValueTemplateEffect.update as jest.Mock).mockResolvedValue({
        id: 'eff-1',
        tintHex: '#00ff00',
      });

      const result = await service.updateTemplateEffect('eff-1', {
        tintHex: '#00ff00',
      });

      expect(prisma.optionValueTemplateEffect.update).toHaveBeenCalledWith({
        where: { id: 'eff-1' },
        data: expect.objectContaining({ tintHex: '#00ff00' }),
      });
      expect(result.tintHex).toBe('#00ff00');
    });

    it('should throw NotFoundException when effect not found', async () => {
      (
        prisma.optionValueTemplateEffect.findUnique as jest.Mock
      ).mockResolvedValue(null);

      await expect(
        service.updateTemplateEffect('invalid', { tintHex: '#000' }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('deleteTemplateEffect', () => {
    it('should delete a template effect', async () => {
      (
        prisma.optionValueTemplateEffect.findUnique as jest.Mock
      ).mockResolvedValue({
        id: 'eff-1',
      });
      (prisma.optionValueTemplateEffect.delete as jest.Mock).mockResolvedValue(
        undefined,
      );

      await service.deleteTemplateEffect('eff-1');

      expect(prisma.optionValueTemplateEffect.delete).toHaveBeenCalledWith({
        where: { id: 'eff-1' },
      });
    });

    it('should throw NotFoundException when effect not found', async () => {
      (
        prisma.optionValueTemplateEffect.findUnique as jest.Mock
      ).mockResolvedValue(null);

      await expect(service.deleteTemplateEffect('invalid')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('upsertProductPrice', () => {
    it('should create or update product price', async () => {
      (prisma.product.findUnique as jest.Mock).mockResolvedValue({
        id: 'prod-1',
      });
      (prisma.productPrice.upsert as jest.Mock).mockResolvedValue({
        id: 'price-1',
        productId: 'prod-1',
        currency: DEFAULT_CURRENCY,
        amount: 5000,
      });

      const result = await service.upsertProductPrice('prod-1', {
        currency: DEFAULT_CURRENCY,
        amount: 5000,
      });

      expect(prisma.productPrice.upsert).toHaveBeenCalledWith({
        where: {
          productId_currency: {
            productId: 'prod-1',
            currency: DEFAULT_CURRENCY,
          },
        },
        create: expect.objectContaining({
          productId: 'prod-1',
          currency: DEFAULT_CURRENCY,
          amount: 5000,
        }),
        update: expect.objectContaining({ amount: 5000 }),
      });
      expect(result.amount).toBe(5000);
    });
  });

  describe('updateProductPrice', () => {
    it('should update product price', async () => {
      (prisma.productPrice.findUnique as jest.Mock).mockResolvedValue({
        id: 'price-1',
        productId: 'prod-1',
      });
      (prisma.productPrice.update as jest.Mock).mockResolvedValue({
        id: 'price-1',
        amount: 6000,
      });

      const result = await service.updateProductPrice('price-1', {
        amount: 6000,
      });

      expect(prisma.productPrice.update).toHaveBeenCalledWith({
        where: { id: 'price-1' },
        data: expect.objectContaining({ amount: 6000 }),
      });
      expect(result.amount).toBe(6000);
    });

    it('should throw NotFoundException when price not found', async () => {
      (prisma.productPrice.findUnique as jest.Mock).mockResolvedValue(null);

      await expect(
        service.updateProductPrice('invalid', { amount: 100 }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('deleteProductPrice', () => {
    it('should delete product price', async () => {
      (prisma.productPrice.findUnique as jest.Mock).mockResolvedValue({
        id: 'price-1',
      });
      (prisma.productPrice.delete as jest.Mock).mockResolvedValue(undefined);

      await service.deleteProductPrice('price-1');

      expect(prisma.productPrice.delete).toHaveBeenCalledWith({
        where: { id: 'price-1' },
      });
    });

    it('should throw NotFoundException when price not found', async () => {
      (prisma.productPrice.findUnique as jest.Mock).mockResolvedValue(null);

      await expect(service.deleteProductPrice('invalid')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('upsertVariantPrice', () => {
    it('should create or update variant price', async () => {
      (prisma.productVariant.findUnique as jest.Mock).mockResolvedValue({
        id: 'var-1',
        productId: 'prod-1',
      });
      (prisma.variantPrice.upsert as jest.Mock).mockResolvedValue({
        id: 'vp-1',
        variantId: 'var-1',
        currency: DEFAULT_CURRENCY,
        amount: 4500,
      });

      const result = await service.upsertVariantPrice('var-1', {
        currency: DEFAULT_CURRENCY,
        amount: 4500,
      });

      expect(prisma.variantPrice.upsert).toHaveBeenCalledWith({
        where: {
          variantId_currency: {
            variantId: 'var-1',
            currency: DEFAULT_CURRENCY,
          },
        },
        create: expect.objectContaining({
          variantId: 'var-1',
          currency: DEFAULT_CURRENCY,
          amount: 4500,
        }),
        update: expect.objectContaining({ amount: 4500 }),
      });
      expect(result.amount).toBe(4500);
    });

    it('should throw NotFoundException when variant not found', async () => {
      (prisma.productVariant.findUnique as jest.Mock).mockResolvedValue(null);

      await expect(
        service.upsertVariantPrice('invalid', {
          currency: DEFAULT_CURRENCY,
          amount: 100,
        }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('updateVariantPrice', () => {
    it('should update variant price', async () => {
      (prisma.variantPrice.findUnique as jest.Mock).mockResolvedValue({
        id: 'vp-1',
        variantId: 'var-1',
      });
      (prisma.variantPrice.update as jest.Mock).mockResolvedValue({
        id: 'vp-1',
        amount: 4800,
      });

      const result = await service.updateVariantPrice('vp-1', {
        amount: 4800,
      });

      expect(prisma.variantPrice.update).toHaveBeenCalledWith({
        where: { id: 'vp-1' },
        data: expect.objectContaining({ amount: 4800 }),
      });
      expect(result.amount).toBe(4800);
    });

    it('should throw NotFoundException when price not found', async () => {
      (prisma.variantPrice.findUnique as jest.Mock).mockResolvedValue(null);

      await expect(
        service.updateVariantPrice('invalid', { amount: 100 }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('deleteVariantPrice', () => {
    it('should delete variant price', async () => {
      (prisma.variantPrice.findUnique as jest.Mock).mockResolvedValue({
        id: 'vp-1',
      });
      (prisma.variantPrice.delete as jest.Mock).mockResolvedValue(undefined);

      await service.deleteVariantPrice('vp-1');

      expect(prisma.variantPrice.delete).toHaveBeenCalledWith({
        where: { id: 'vp-1' },
      });
    });

    it('should throw NotFoundException when price not found', async () => {
      (prisma.variantPrice.findUnique as jest.Mock).mockResolvedValue(null);

      await expect(service.deleteVariantPrice('invalid')).rejects.toThrow(
        NotFoundException,
      );
    });
  });
});
