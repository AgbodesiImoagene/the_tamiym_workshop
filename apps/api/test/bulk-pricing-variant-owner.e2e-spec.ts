import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import * as bcrypt from 'bcrypt';
import { closeE2eApp, createE2eApp } from './utils/create-e2e-app';
import { ensureLga } from './utils/geo-fixtures';
import { generateTotpCode } from '../src/auth/admin-mfa.totp';
import { AuthService, isMfaChallengeResponse } from '../src/auth/auth.service';
import {
  AuthSurface,
  CurrencyCode,
  ProductStatus,
  ShippingRateProvider,
  ShippingRuleMatchType,
  UserRole,
  UserStatus,
} from '../src/generated/prisma/enums';
import { BulkPricingService } from '../src/bulk-pricing/bulk-pricing.service';
import { PricingService } from '../src/pricing/pricing.service';
import { PrismaService } from '../src/prisma/prisma.service';

/**
 * TTW-272: a bulk tier names a product and, optionally, a variant. The variant
 * must belong to that product. Before the fix a foreign tier was accepted, and
 * the quote, which then read a variant's tiers by variant only, applied it.
 */
describe('Bulk pricing tier variant ownership (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let pricing: PricingService;
  let adminAuth: string;
  let adminId: string;
  let customerId: string;
  let categoryId: string;
  let zoneId: string;
  let addressId: string;
  const productIds: string[] = [];

  const BASE_PRICE = 5000;

  beforeAll(async () => {
    app = await createE2eApp();
    // One listening server, so that requests can be sent at the same time.
    await app.listen(0);
    prisma = app.get(PrismaService);
    pricing = app.get(PricingService);
    const authService = app.get(AuthService);

    const suffix = `owner-${Date.now()}`;
    const password = 'TestPassword1!';
    const passwordHash = await bcrypt.hash(password, 10);
    const email = `bulk-${suffix}@example.com`;
    const admin = await prisma.user.create({
      data: {
        email,
        passwordHash,
        role: UserRole.ADMIN,
        status: UserStatus.ACTIVE,
        firstName: 'Bulk',
        lastName: 'Admin',
        emailVerifiedAt: new Date(),
      },
    });
    adminId = admin.id;

    const challenge = await authService.login(
      { email, password },
      AuthSurface.ADMIN,
    );
    if (!isMfaChallengeResponse(challenge)) {
      throw new Error('expected MFA enrollment challenge');
    }
    const enrollment = await authService.adminMfaEnrollStart(
      challenge.mfa_token,
    );
    const session = await authService.adminMfaEnrollConfirm(
      challenge.mfa_token,
      generateTotpCode(enrollment.secret),
    );
    adminAuth = `Bearer ${session.access_token}`;

    const customer = await prisma.user.create({
      data: {
        email: `bulk-cust-${suffix}@example.com`,
        passwordHash,
        role: UserRole.CUSTOMER,
        status: UserStatus.ACTIVE,
        firstName: 'Bulk',
        lastName: 'Customer',
        emailVerifiedAt: new Date(),
      },
    });
    customerId = customer.id;

    const category = await prisma.category.create({
      data: { name: `Owner Cat ${suffix}`, slug: `owner-cat-${suffix}` },
    });
    categoryId = category.id;

    await prisma.geoState.upsert({
      where: { code: 'LA' },
      update: { isActive: true },
      create: { code: 'LA', name: 'Lagos', isActive: true },
    });
    const zone = await prisma.shippingZone.create({
      data: { name: `Owner Lagos ${suffix}`, isActive: true },
    });
    zoneId = zone.id;
    await prisma.shippingZoneRule.create({
      data: {
        zoneId,
        countryCode: 'NG',
        matchType: ShippingRuleMatchType.ADMIN1,
        matchValue: 'LA',
        priority: 100,
        isActive: true,
      },
    });
    await prisma.shippingRate.create({
      data: {
        zoneId,
        provider: ShippingRateProvider.INTERNAL,
        serviceLevel: 'STANDARD',
        currency: CurrencyCode.NGN,
        flatFee: 2000,
        priority: 100,
        isActive: true,
        minDeliveryDays: 2,
        maxDeliveryDays: 4,
      },
    });
    const address = await prisma.address.create({
      data: {
        userId: customerId,
        addressLine1: '1 Owner Street',
        city: 'Ikeja',
        state: 'Lagos',
        stateCode: 'LA',
        lgaId: (await ensureLga(prisma)).id,
        countryCode: 'NG',
        country: 'Nigeria',
      },
    });
    addressId = address.id;
  });

  afterAll(async () => {
    await prisma.product.deleteMany({ where: { id: { in: productIds } } });
    await prisma.category.delete({ where: { id: categoryId } });
    await prisma.address.delete({ where: { id: addressId } });
    await prisma.shippingRate.deleteMany({ where: { zoneId } });
    await prisma.shippingZoneRule.deleteMany({ where: { zoneId } });
    await prisma.shippingZone.delete({ where: { id: zoneId } });
    await prisma.authSession.deleteMany({
      where: { userId: { in: [adminId, customerId] } },
    });
    await prisma.user.deleteMany({
      where: { id: { in: [adminId, customerId] } },
    });
    await closeE2eApp(app);
  });

  async function seedProductWithVariant() {
    const suffix = `${Date.now()}-${productIds.length}`;
    const product = await prisma.product.create({
      data: {
        name: `Owner Product ${suffix}`,
        slug: `owner-product-${suffix}`,
        status: ProductStatus.ACTIVE,
        categoryId,
        prices: {
          create: { currency: CurrencyCode.NGN, amount: BASE_PRICE },
        },
      },
    });
    productIds.push(product.id);
    const variant = await prisma.productVariant.create({
      data: {
        productId: product.id,
        name: 'Default',
        sku: `SKU-OWNER-${suffix}`,
        inventory: {
          create: {
            stockOnHand: 50,
            reserved: 0,
            trackInventory: true,
            lowStockThreshold: 0,
          },
        },
      },
    });
    return { productId: product.id, variantId: variant.id };
  }

  function createTier(body: Record<string, unknown>) {
    return request(app.getHttpServer())
      .post('/v1/admin/bulk-pricing')
      .set('Authorization', adminAuth)
      .send({
        currency: CurrencyCode.NGN,
        minQuantity: 5,
        pricePerUnit: 100,
        ...body,
      });
  }

  /** Resolves once PostgreSQL shows a bulk tier insert waiting for a lock. */
  async function waitForBlockedTierInsert() {
    const deadline = Date.now() + 10000;
    while (Date.now() < deadline) {
      const [{ waiting }] = await prisma.$queryRaw<{ waiting: number }[]>`
        SELECT count(*)::int AS waiting
        FROM pg_stat_activity
        WHERE datname = current_database()
          AND wait_event_type = 'Lock'
          AND query LIKE 'INSERT INTO "public"."bulk_pricing"%'
      `;
      if (waiting > 0) return;
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
    throw new Error('the tier insert never waited for the variant delete');
  }

  async function quotedUnitPrice(variantId: string) {
    const quote = await pricing.quoteStandard(customerId, {
      shippingAddressId: addressId,
      items: [{ variantId, quantity: 6 }],
    });
    return quote.items[0].unitFinalPrice;
  }

  describe('a variant of another product', () => {
    it('is rejected with a clear 400 and stores nothing', async () => {
      const target = await seedProductWithVariant();
      const other = await seedProductWithVariant();

      const res = await createTier({
        productId: other.productId,
        variantId: target.variantId,
      });

      expect(res.status).toBe(400);
      expect(res.body.message).toMatch(/variant does not belong/i);
      await expect(
        prisma.bulkPricing.count({
          where: {
            productId: { in: [target.productId, other.productId] },
          },
        }),
      ).resolves.toBe(0);
    });

    it('cannot change the quoted price of that variant', async () => {
      const target = await seedProductWithVariant();
      const other = await seedProductWithVariant();
      await expect(quotedUnitPrice(target.variantId)).resolves.toBe(BASE_PRICE);

      await createTier({
        productId: other.productId,
        variantId: target.variantId,
      });

      await expect(quotedUnitPrice(target.variantId)).resolves.toBe(BASE_PRICE);
    });
  });

  describe('a variant that is not there', () => {
    it('is rejected with the same 400 when the id is unknown', async () => {
      const { productId } = await seedProductWithVariant();

      const res = await createTier({ productId, variantId: 'no-such-variant' });

      expect(res.status).toBe(400);
      expect(res.body.message).toMatch(/variant does not belong/i);
      await expect(
        prisma.bulkPricing.count({ where: { productId } }),
      ).resolves.toBe(0);
    });

    it('is rejected with the same 400 when it is removed before the write', async () => {
      const { productId, variantId } = await seedProductWithVariant();
      // The overlap read sits between the ownership check and the insert.
      const overlapRead = jest
        .spyOn(app.get(BulkPricingService), 'assertNoOverlap')
        .mockImplementationOnce(async () => {
          await prisma.productVariant.delete({ where: { id: variantId } });
        });

      const res = await createTier({ productId, variantId });

      expect(overlapRead).toHaveBeenCalledTimes(1);
      overlapRead.mockRestore();
      expect(res.status).toBe(400);
      expect(res.body.message).toMatch(/variant does not belong/i);
      await expect(
        prisma.bulkPricing.count({ where: { productId } }),
      ).resolves.toBe(0);
    });
  });

  describe('repeated and concurrent requests', () => {
    it('refuses a foreign pair again when it is sent again', async () => {
      const target = await seedProductWithVariant();
      const other = await seedProductWithVariant();
      const foreign = {
        productId: other.productId,
        variantId: target.variantId,
      };

      const first = await createTier(foreign);
      const second = await createTier(foreign);

      expect([first.status, second.status]).toEqual([400, 400]);
      await expect(
        prisma.bulkPricing.count({ where: { productId: other.productId } }),
      ).resolves.toBe(0);
    });

    it('refuses every foreign copy sent at once and keeps the valid tier', async () => {
      const target = await seedProductWithVariant();
      const other = await seedProductWithVariant();
      const foreign = {
        productId: other.productId,
        variantId: target.variantId,
      };

      const responses = await Promise.all([
        createTier(foreign),
        createTier(foreign),
        createTier(other),
        createTier(foreign),
        createTier(foreign),
      ]);

      expect(responses.map((res) => res.status)).toEqual([
        400, 400, 201, 400, 400,
      ]);
      await expect(
        prisma.bulkPricing.findMany({
          where: { productId: { in: [target.productId, other.productId] } },
          select: { productId: true, variantId: true },
        }),
      ).resolves.toEqual([other]);
    });

    it('answers 400 when the variant is deleted while the tier is written', async () => {
      const { productId, variantId } = await seedProductWithVariant();
      let pending: Promise<request.Response> | undefined;

      await prisma.$transaction(
        async (tx) => {
          await tx.productVariant.delete({ where: { id: variantId } });
          // Not committed yet: the ownership check still sees the variant, and
          // the insert then waits on the foreign key for this transaction.
          pending = createTier({ productId, variantId }).then((res) => res);
          await waitForBlockedTierInsert();
        },
        { timeout: 20000 },
      );
      const res = await pending!;

      expect(res.status).toBe(400);
      expect(res.body.message).toMatch(/variant does not belong/i);
      await expect(
        prisma.bulkPricing.count({ where: { productId } }),
      ).resolves.toBe(0);
    });
  });

  describe('the database', () => {
    function writeTier(data: { productId: string; variantId?: string }) {
      return prisma.bulkPricing.create({
        data: {
          currency: CurrencyCode.NGN,
          minQuantity: 5,
          pricePerUnit: 100,
          ...data,
        },
      });
    }

    const FOREIGN_KEY_VIOLATION = { code: 'P2003' };

    it('refuses to insert a variant of another product', async () => {
      const target = await seedProductWithVariant();
      const other = await seedProductWithVariant();

      await expect(
        writeTier({
          productId: other.productId,
          variantId: target.variantId,
        }),
      ).rejects.toMatchObject(FOREIGN_KEY_VIOLATION);
    });

    it.each(['productId', 'variantId'] as const)(
      'refuses to change the %s of a tier to a foreign pair',
      async (field) => {
        const own = await seedProductWithVariant();
        const other = await seedProductWithVariant();
        const tier = await writeTier(own);

        await expect(
          prisma.bulkPricing.update({
            where: { id: tier.id },
            data: { [field]: other[field] },
          }),
        ).rejects.toMatchObject(FOREIGN_KEY_VIOLATION);
        await expect(
          prisma.bulkPricing.findUniqueOrThrow({ where: { id: tier.id } }),
        ).resolves.toMatchObject(own);
      },
    );

    it('still deletes the tiers of a deleted variant only', async () => {
      const own = await seedProductWithVariant();
      const variantTier = await writeTier(own);
      const productTier = await writeTier({ productId: own.productId });

      await prisma.productVariant.delete({ where: { id: own.variantId } });

      await expect(
        prisma.bulkPricing.findMany({
          where: { id: { in: [variantTier.id, productTier.id] } },
          select: { id: true },
        }),
      ).resolves.toEqual([{ id: productTier.id }]);
    });

    it('still deletes the tiers of a deleted product', async () => {
      const own = await seedProductWithVariant();
      await writeTier(own);
      await writeTier({ productId: own.productId });

      await prisma.product.delete({ where: { id: own.productId } });

      await expect(
        prisma.bulkPricing.count({ where: { productId: own.productId } }),
      ).resolves.toBe(0);
    });
  });

  describe('valid tiers', () => {
    it('stores a tier for a variant of the product', async () => {
      const { productId, variantId } = await seedProductWithVariant();

      const res = await createTier({ productId, variantId });

      expect(res.status).toBe(201);
      expect(res.body).toMatchObject({ productId, variantId });
      await expect(quotedUnitPrice(variantId)).resolves.toBe(100);
    });

    it('stores a product-level tier', async () => {
      const { productId, variantId } = await seedProductWithVariant();

      const res = await createTier({ productId });

      expect(res.status).toBe(201);
      expect(res.body).toMatchObject({ productId, variantId: null });
      await expect(quotedUnitPrice(variantId)).resolves.toBe(100);
    });
  });

  describe('updating a tier', () => {
    it('never moves it to another product or variant', async () => {
      const own = await seedProductWithVariant();
      const other = await seedProductWithVariant();
      const created = await createTier(own);
      expect(created.status).toBe(201);
      const id = created.body.id as string;

      const res = await request(app.getHttpServer())
        .patch(`/v1/admin/bulk-pricing/${id}`)
        .set('Authorization', adminAuth)
        .send({ variantId: other.variantId, productId: other.productId });

      expect(res.status).toBe(200);
      await expect(
        prisma.bulkPricing.findUniqueOrThrow({ where: { id } }),
      ).resolves.toMatchObject(own);
    });
  });
});
