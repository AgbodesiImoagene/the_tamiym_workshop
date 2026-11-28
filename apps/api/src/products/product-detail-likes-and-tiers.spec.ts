import { Test, TestingModule } from '@nestjs/testing';
import { MediaService } from '../media/media.service';
import { PrismaService } from '../prisma/prisma.service';
import { ProductsService } from './products.service';

describe('ProductsService.findOne — likes and bulk tiers (TTW-269)', () => {
  let service: ProductsService;
  const prisma = { product: { findUnique: jest.fn() } };

  /** Prisma returns Decimal columns as objects that print as strings. */
  const decimal = (value: string) => ({ toString: () => value });

  const row = {
    id: 'p1',
    variants: [
      {
        id: 'v1',
        isAvailable: true,
        inventory: null,
        optionValues: [],
        prices: [],
        bulkPricing: [
          {
            minQuantity: 5,
            maxQuantity: null,
            pricePerUnit: decimal('4200.50'),
            currency: 'NGN',
          },
        ],
      },
      {
        id: 'v2',
        isAvailable: true,
        inventory: null,
        optionValues: [],
        prices: [],
        bulkPricing: [],
      },
    ],
    prices: [],
    images: [],
    productImageRoles: [],
    views: [],
    bulkPricingTiers: [
      {
        minQuantity: 10,
        maxQuantity: 49,
        pricePerUnit: decimal('4500.00'),
        currency: 'NGN',
      },
      {
        minQuantity: 50,
        maxQuantity: null,
        pricePerUnit: decimal('4000.00'),
        currency: 'NGN',
      },
    ],
    _count: { likes: 3 },
  };

  beforeEach(async () => {
    jest.resetAllMocks();
    prisma.product.findUnique.mockResolvedValue(row);
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ProductsService,
        { provide: PrismaService, useValue: prisma },
        { provide: MediaService, useValue: {} },
      ],
    }).compile();
    service = module.get(ProductsService);
  });

  it('reads the like count and the NGN tiers, product level and per variant, lowest quantity first', async () => {
    await service.findOne('p1');

    const tierSelect = {
      minQuantity: true,
      maxQuantity: true,
      pricePerUnit: true,
      currency: true,
    };
    const { include } = prisma.product.findUnique.mock.calls[0][0] as {
      include: Record<string, unknown> & {
        variants: { select: Record<string, unknown> };
      };
    };
    expect(include._count).toEqual({ select: { likes: true } });
    expect(include.bulkPricingTiers).toEqual({
      where: { variantId: null, currency: 'NGN' },
      select: tierSelect,
      orderBy: { minQuantity: 'asc' },
    });
    expect(include.variants.select.bulkPricing).toEqual({
      where: { currency: 'NGN' },
      select: tierSelect,
      orderBy: { minQuantity: 'asc' },
    });
  });

  it('returns the like count as a number and nothing about who liked', async () => {
    const result = await service.findOne('p1');

    expect(result.likeCount).toBe(3);
    expect(result).not.toHaveProperty('_count');
    expect(result).not.toHaveProperty('likes');
    expect(result).not.toHaveProperty('likedByMe');
  });

  it('returns product tiers with a numeric unit price', async () => {
    const result = await service.findOne('p1');

    expect(result.bulkPricingTiers).toEqual([
      {
        minQuantity: 10,
        maxQuantity: 49,
        pricePerUnit: 4500,
        currency: 'NGN',
      },
      {
        minQuantity: 50,
        maxQuantity: null,
        pricePerUnit: 4000,
        currency: 'NGN',
      },
    ]);
  });

  it('puts the own tiers of a variant on that variant, and an empty list on the others', async () => {
    const { variants } = await service.findOne('p1');

    expect(variants[0].bulkPricingTiers).toEqual([
      {
        minQuantity: 5,
        maxQuantity: null,
        pricePerUnit: 4200.5,
        currency: 'NGN',
      },
    ]);
    expect(variants[1].bulkPricingTiers).toEqual([]);
    expect(variants[0]).not.toHaveProperty('bulkPricing');
  });
});
