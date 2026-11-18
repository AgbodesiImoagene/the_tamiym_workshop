import { INestApplication } from '@nestjs/common';
import { App } from 'supertest/types';
import { closeE2eApp, createE2eApp } from './utils/create-e2e-app';
import { PricingService } from '../src/pricing/pricing.service';
import { PrismaService } from '../src/prisma/prisma.service';
import {
  CurrencyCode,
  ProductStatus,
  UserRole,
  UserStatus,
} from '../src/generated/prisma/enums';

/**
 * TTW-220: when a product-level row (`variantId` NULL) and a variant-level row
 * both exist for the same view and currency, the variant row wins, whatever
 * order Postgres returns them in. Runs the real PricingService against real
 * Postgres. NGN is the only currency in the enum, so the currency filter
 * cannot be exercised with a second currency here.
 */
describe('View surcharge precedence (e2e)', () => {
  const suffix = `${Date.now()}`;
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let pricing: PricingService;
  let userId: string;
  let seq = 0;
  const createdProductIds: string[] = [];
  const createdCategoryIds: string[] = [];

  const surchargeFor = (
    variantId: string,
    productId: string,
    designId: string,
  ): Promise<number> =>
    (
      pricing as unknown as {
        computeViewSurchargeForDesign: (
          variantId: string,
          productId: string,
          designId: string | null,
          currency: string,
        ) => Promise<number>;
      }
    ).computeViewSurchargeForDesign(variantId, productId, designId, 'NGN');

  /** Two variants (XXL, M), two views, and a design that uses both views. */
  async function seed(label: string) {
    const n = ++seq;
    const category = await prisma.category.create({
      data: {
        name: `Precedence Cat ${label}-${n} ${suffix}`,
        slug: `precedence-cat-${label}-${n}-${suffix}`,
      },
    });
    const product = await prisma.product.create({
      data: {
        name: `Precedence Product ${label}-${n}`,
        slug: `precedence-product-${label}-${n}-${suffix}`,
        status: ProductStatus.ACTIVE,
        categoryId: category.id,
        prices: { create: { currency: CurrencyCode.NGN, amount: 5000 } },
      },
    });
    createdProductIds.push(product.id);
    createdCategoryIds.push(category.id);
    const variantXxl = await prisma.productVariant.create({
      data: {
        productId: product.id,
        name: 'XXL',
        sku: `SKU-PREC-${label}-${n}-${suffix}-XXL`,
      },
    });
    const variantM = await prisma.productVariant.create({
      data: {
        productId: product.id,
        name: 'M',
        sku: `SKU-PREC-${label}-${n}-${suffix}-M`,
      },
    });
    const front = await prisma.productView.create({
      data: {
        productId: product.id,
        key: 'front',
        displayName: 'Front',
        isDefault: true,
      },
    });
    const back = await prisma.productView.create({
      data: { productId: product.id, key: 'back', displayName: 'Back' },
    });
    const design = await prisma.design.create({
      data: {
        userId,
        productId: product.id,
        name: `Precedence design ${label}-${n}`,
        designData: {},
      },
    });
    // The first DesignView (lowest id) is the free one.
    await prisma.designView.create({
      data: { designId: design.id, productViewId: front.id, isUsed: true },
    });
    await prisma.designView.create({
      data: { designId: design.id, productViewId: back.id, isUsed: true },
    });
    return { product, variantXxl, variantM, front, back, design };
  }

  type Seeded = Awaited<ReturnType<typeof seed>>;

  const productRow = (s: Seeded, amount: number) =>
    prisma.productViewPricing.create({
      data: {
        productId: s.product.id,
        variantId: null,
        productViewId: s.back.id,
        currency: CurrencyCode.NGN,
        surchargeAmount: amount,
      },
    });
  const variantRow = (s: Seeded, variantId: string, amount: number) =>
    prisma.productViewPricing.create({
      data: {
        productId: s.product.id,
        variantId,
        productViewId: s.back.id,
        currency: CurrencyCode.NGN,
        surchargeAmount: amount,
      },
    });

  beforeAll(async () => {
    app = await createE2eApp();
    prisma = app.get(PrismaService);
    pricing = app.get(PricingService);
    const user = await prisma.user.create({
      data: {
        email: `precedence-${suffix}@example.com`,
        passwordHash: 'not-used',
        role: UserRole.CUSTOMER,
        status: UserStatus.ACTIVE,
        emailVerifiedAt: new Date(),
        firstName: 'Precedence',
        lastName: 'Test',
      },
    });
    userId = user.id;
  });

  afterAll(async () => {
    await prisma.design.deleteMany({ where: { userId } });
    await prisma.product.deleteMany({
      where: { id: { in: createdProductIds } },
    });
    await prisma.category.deleteMany({
      where: { id: { in: createdCategoryIds } },
    });
    await prisma.user.deleteMany({ where: { id: userId } });
    await closeE2eApp(app);
  });

  it.each([
    ['product row inserted first', true],
    ['variant row inserted first', false],
  ])(
    'the variant row wins and 20 repeated reads agree (%s)',
    async (_label, productFirst) => {
      const s = await seed(productFirst ? 'pf' : 'vf');
      if (productFirst) {
        await productRow(s, 1000);
        await variantRow(s, s.variantXxl.id, 400);
      } else {
        await variantRow(s, s.variantXxl.id, 400);
        await productRow(s, 1000);
      }
      const seen = new Set<number>();
      for (let i = 0; i < 20; i++) {
        seen.add(
          await surchargeFor(s.variantXxl.id, s.product.id, s.design.id),
        );
      }
      expect([...seen]).toEqual([400]);
    },
  );

  it('a variant without its own row keeps the product row', async () => {
    const s = await seed('other-variant');
    await productRow(s, 1000);
    await variantRow(s, s.variantXxl.id, 400);
    expect(await surchargeFor(s.variantM.id, s.product.id, s.design.id)).toBe(
      1000,
    );
    expect(await surchargeFor(s.variantXxl.id, s.product.id, s.design.id)).toBe(
      400,
    );
  });

  it('a variant row of 0 wins over a positive product row', async () => {
    const s = await seed('zero');
    await productRow(s, 1000);
    await variantRow(s, s.variantXxl.id, 0);
    expect(await surchargeFor(s.variantXxl.id, s.product.id, s.design.id)).toBe(
      0,
    );
  });

  it('single-row cases are unchanged: product only, variant only, none', async () => {
    const productOnly = await seed('product-only');
    await productRow(productOnly, 1000);
    expect(
      await surchargeFor(
        productOnly.variantXxl.id,
        productOnly.product.id,
        productOnly.design.id,
      ),
    ).toBe(1000);

    const variantOnly = await seed('variant-only');
    await variantRow(variantOnly, variantOnly.variantXxl.id, 400);
    expect(
      await surchargeFor(
        variantOnly.variantXxl.id,
        variantOnly.product.id,
        variantOnly.design.id,
      ),
    ).toBe(400);
    expect(
      await surchargeFor(
        variantOnly.variantM.id,
        variantOnly.product.id,
        variantOnly.design.id,
      ),
    ).toBe(0);

    const none = await seed('none');
    expect(
      await surchargeFor(none.variantXxl.id, none.product.id, none.design.id),
    ).toBe(0);
  });
});
