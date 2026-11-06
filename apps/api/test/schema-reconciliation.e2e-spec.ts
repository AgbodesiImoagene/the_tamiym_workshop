import { BadRequestException, INestApplication } from '@nestjs/common';
import { App } from 'supertest/types';
import { closeE2eApp, createE2eApp } from './utils/create-e2e-app';
import { BulkPricingService } from '../src/bulk-pricing/bulk-pricing.service';
import { CurrencyCode, ProductStatus } from '../src/generated/prisma/enums';
import { PrismaService } from '../src/prisma/prisma.service';

/**
 * TTW-005: objects Prisma cannot fully express must keep working once
 * schema.prisma declares them. Tiers are written directly as well as through
 * the service, because the service rejects overlaps before the database can.
 */
describe('Prisma schema reconciliation (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let service: BulkPricingService;
  const productIds: string[] = [];
  let categoryId: string;

  const OVERLAP_ERROR = /bulk_pricing_quantity_no_overlap/;

  beforeAll(async () => {
    app = await createE2eApp();
    prisma = app.get(PrismaService);
    service = app.get(BulkPricingService);

    const suffix = `schema-${Date.now()}`;
    const category = await prisma.category.create({
      data: { name: `Schema Cat ${suffix}`, slug: `schema-cat-${suffix}` },
    });
    categoryId = category.id;
  });

  afterAll(async () => {
    await prisma.product.deleteMany({ where: { id: { in: productIds } } });
    await prisma.category.delete({ where: { id: categoryId } });
    await closeE2eApp(app);
  });

  async function seedProduct() {
    const suffix = `${Date.now()}-${productIds.length}`;
    const product = await prisma.product.create({
      data: {
        name: `Schema Product ${suffix}`,
        slug: `schema-product-${suffix}`,
        status: ProductStatus.ACTIVE,
        categoryId,
      },
    });
    productIds.push(product.id);
    const variant = await prisma.productVariant.create({
      data: {
        productId: product.id,
        name: 'Default',
        sku: `SKU-SCHEMA-${suffix}`,
      },
    });
    return { productId: product.id, variantId: variant.id };
  }

  function writeTier(data: {
    productId: string;
    variantId?: string | null;
    minQuantity: number;
    maxQuantity?: number | null;
  }) {
    return prisma.bulkPricing.create({
      data: {
        currency: CurrencyCode.NGN,
        pricePerUnit: 1000,
        ...data,
      },
    });
  }

  async function storedRange(id: string) {
    const [row] = await prisma.$queryRaw<
      { quantityRange: string; variantKey: string }[]
    >`
      SELECT "quantityRange"::text AS "quantityRange", "variantKey"
      FROM "bulk_pricing"
      WHERE "id" = ${id}
    `;
    return row;
  }

  describe('bulk price tiers', () => {
    it('rejects a direct write that overlaps a tier for the same scope', async () => {
      const { productId, variantId } = await seedProduct();
      await writeTier({
        productId,
        variantId,
        minQuantity: 1,
        maxQuantity: 10,
      });

      await expect(
        writeTier({ productId, variantId, minQuantity: 5, maxQuantity: 20 }),
      ).rejects.toThrow(OVERLAP_ERROR);
    });

    it('rejects overlapping product-wide tiers, where variantId is null', async () => {
      const { productId } = await seedProduct();
      await writeTier({ productId, minQuantity: 1, maxQuantity: 10 });

      await expect(
        writeTier({ productId, minQuantity: 10, maxQuantity: 20 }),
      ).rejects.toThrow(OVERLAP_ERROR);
    });

    it('accepts tiers that touch without sharing a quantity', async () => {
      const { productId, variantId } = await seedProduct();
      await writeTier({
        productId,
        variantId,
        minQuantity: 1,
        maxQuantity: 10,
      });

      await expect(
        writeTier({ productId, variantId, minQuantity: 11, maxQuantity: 20 }),
      ).resolves.toMatchObject({ minQuantity: 11 });
    });

    it('accepts the same quantities for another variant or product-wide', async () => {
      const { productId, variantId } = await seedProduct();
      const other = await prisma.productVariant.create({
        data: { productId, name: 'Other', sku: `SKU-OTHER-${productId}` },
      });
      await writeTier({
        productId,
        variantId,
        minQuantity: 1,
        maxQuantity: 10,
      });

      await expect(
        writeTier({
          productId,
          variantId: other.id,
          minQuantity: 1,
          maxQuantity: 10,
        }),
      ).resolves.toBeDefined();
      await expect(
        writeTier({ productId, minQuantity: 1, maxQuantity: 10 }),
      ).resolves.toBeDefined();
    });

    it('keeps the stored range of a tier with a maximum', async () => {
      const { productId, variantId } = await seedProduct();
      const tier = await writeTier({
        productId,
        variantId,
        minQuantity: 1,
        maxQuantity: 24,
      });

      await expect(storedRange(tier.id)).resolves.toEqual({
        quantityRange: '[1,25)',
        variantKey: variantId,
      });
    });

    it('stores a tier with no maximum as an unbounded range', async () => {
      const { productId } = await seedProduct();

      const tier = await service.create({
        productId,
        currency: CurrencyCode.NGN,
        minQuantity: 100,
        maxQuantity: null,
        pricePerUnit: 900,
      });

      expect(tier).toMatchObject({ minQuantity: 100, maxQuantity: null });
      await expect(storedRange(tier.id)).resolves.toEqual({
        quantityRange: '[100,)',
        variantKey: '',
      });
    });

    it('lets an existing tier become open-ended', async () => {
      const { productId } = await seedProduct();
      const tier = await writeTier({
        productId,
        minQuantity: 1,
        maxQuantity: 10,
      });

      await expect(
        service.update(tier.id, { maxQuantity: null }),
      ).resolves.toMatchObject({ maxQuantity: null });
    });

    it('rejects a tier overlapping an open-ended tier', async () => {
      const { productId } = await seedProduct();
      await writeTier({ productId, minQuantity: 100, maxQuantity: null });

      await expect(
        writeTier({ productId, minQuantity: 500, maxQuantity: 600 }),
      ).rejects.toThrow(OVERLAP_ERROR);
      await expect(
        writeTier({ productId, minQuantity: 50, maxQuantity: null }),
      ).rejects.toThrow(OVERLAP_ERROR);
    });

    it('turns the real constraint error into a 400 when the pre-check is raced', async () => {
      const { productId } = await seedProduct();
      await writeTier({ productId, minQuantity: 1, maxQuantity: 10 });
      const preCheck = jest
        .spyOn(service, 'assertNoOverlap')
        .mockResolvedValueOnce(undefined);

      await expect(
        service.create({
          productId,
          currency: CurrencyCode.NGN,
          minQuantity: 5,
          maxQuantity: 20,
          pricePerUnit: 900,
        }),
      ).rejects.toBeInstanceOf(BadRequestException);

      preCheck.mockRestore();
    });

    it('does not expose the generated columns through Prisma Client', async () => {
      const { productId } = await seedProduct();
      await writeTier({ productId, minQuantity: 1, maxQuantity: 10 });

      const [listed] = await prisma.bulkPricing.findMany({
        where: { productId },
      });

      expect(listed).not.toHaveProperty('variantKey');
      expect(listed).not.toHaveProperty('quantityRange');
    });
  });

  describe('payments.status', () => {
    it('defaults to PENDING in the database, as in schema.prisma', async () => {
      const [column] = await prisma.$queryRaw<{ column_default: string }[]>`
        SELECT column_default
        FROM information_schema.columns
        WHERE table_schema = current_schema()
          AND table_name = 'payments'
          AND column_name = 'status'
      `;

      expect(column.column_default).toBe(`'PENDING'::"PaymentStatus"`);
    });
  });
});
