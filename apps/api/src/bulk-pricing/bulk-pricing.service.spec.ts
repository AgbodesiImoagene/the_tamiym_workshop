import { BadRequestException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { BulkPricingService } from './bulk-pricing.service';

describe('BulkPricingService', () => {
  let service: BulkPricingService;
  let prisma: {
    productVariant: { findFirst: jest.Mock };
    bulkPricing: {
      findMany: jest.Mock;
      create: jest.Mock;
      findUnique: jest.Mock;
      update: jest.Mock;
      delete: jest.Mock;
    };
  };

  beforeEach(async () => {
    prisma = {
      productVariant: {
        findFirst: jest.fn().mockResolvedValue({ id: 'v1' }),
      },
      bulkPricing: {
        findMany: jest.fn().mockResolvedValue([]),
        create: jest.fn().mockResolvedValue({ id: 'tier-1' }),
        findUnique: jest.fn(),
        update: jest.fn().mockResolvedValue({ id: 'tier-1' }),
        delete: jest.fn(),
      },
    };
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BulkPricingService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();
    service = module.get(BulkPricingService);
  });

  it('creates a tier when no overlap', async () => {
    await expect(
      service.create({
        productId: 'p1',
        currency: 'NGN',
        minQuantity: 1,
        maxQuantity: 9,
        pricePerUnit: 1000,
      }),
    ).resolves.toEqual({ id: 'tier-1' });
  });

  describe('variant ownership (TTW-272)', () => {
    const variantTier = {
      productId: 'p1',
      variantId: 'v1',
      currency: 'NGN',
      minQuantity: 1,
      pricePerUnit: 1000,
    };
    const NOT_OWNED = 'Variant does not belong to this product.';

    it('creates a tier for a variant of the product', async () => {
      await expect(service.create(variantTier)).resolves.toEqual({
        id: 'tier-1',
      });
      expect(prisma.productVariant.findFirst).toHaveBeenCalledWith({
        where: { id: 'v1', productId: 'p1' },
        select: { id: true },
      });
    });

    it.each(['v-other', ''])(
      'rejects variant "%s" that the product does not have and writes nothing',
      async (variantId) => {
        prisma.productVariant.findFirst.mockResolvedValue(null);

        await expect(
          service.create({ ...variantTier, variantId }),
        ).rejects.toThrow(new BadRequestException(NOT_OWNED));
        expect(prisma.bulkPricing.create).not.toHaveBeenCalled();
      },
    );

    it('looks up no variant for a product-level tier', async () => {
      await service.create({ ...variantTier, variantId: null });

      expect(prisma.productVariant.findFirst).not.toHaveBeenCalled();
    });

    it('maps the ownership foreign key violation to the same 400', async () => {
      prisma.bulkPricing.create.mockRejectedValue(
        new Prisma.PrismaClientKnownRequestError(
          'Foreign key constraint violated on the constraint: `bulk_pricing_variantId_productId_fkey`',
          { code: 'P2003', clientVersion: 'test' },
        ),
      );

      await expect(service.create(variantTier)).rejects.toThrow(
        new BadRequestException(NOT_OWNED),
      );
    });
  });

  it('maps EXCLUDE constraint violations to BadRequestException on create', async () => {
    prisma.bulkPricing.create.mockRejectedValue(
      new Error(
        'conflicting key value violates exclusion constraint "bulk_pricing_quantity_no_overlap"',
      ),
    );
    await expect(
      service.create({
        productId: 'p1',
        currency: 'NGN',
        minQuantity: 5,
        maxQuantity: 10,
        pricePerUnit: 900,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('maps EXCLUDE constraint violations to BadRequestException on update', async () => {
    prisma.bulkPricing.findUnique.mockResolvedValue({
      id: 'tier-1',
      productId: 'p1',
      variantId: null,
      currency: 'NGN',
      minQuantity: 1,
      maxQuantity: 9,
    });
    prisma.bulkPricing.update.mockRejectedValue(
      new Error('bulk_pricing_quantity_no_overlap'),
    );
    await expect(
      service.update('tier-1', { maxQuantity: 20 }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects overlapping ranges via assertNoOverlap', async () => {
    prisma.bulkPricing.findMany.mockResolvedValue([
      { id: 'existing', minQuantity: 1, maxQuantity: 10 },
    ]);
    await expect(
      service.create({
        productId: 'p1',
        currency: 'NGN',
        minQuantity: 5,
        maxQuantity: 15,
        pricePerUnit: 800,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});

describe('BulkPricingService Prisma error passthrough', () => {
  it('rethrows non-exclusion errors', async () => {
    const prisma = {
      bulkPricing: {
        findMany: jest.fn().mockResolvedValue([]),
        create: jest.fn().mockRejectedValue(
          new Prisma.PrismaClientKnownRequestError('boom', {
            code: 'P2003',
            clientVersion: 'test',
          }),
        ),
        findUnique: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
      },
    };
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BulkPricingService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();
    const service = module.get(BulkPricingService);
    await expect(
      service.create({
        productId: 'p1',
        currency: 'NGN',
        minQuantity: 1,
        pricePerUnit: 1000,
      }),
    ).rejects.toBeInstanceOf(Prisma.PrismaClientKnownRequestError);
  });
});
