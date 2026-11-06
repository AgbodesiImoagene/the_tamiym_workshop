import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import * as bcrypt from 'bcrypt';
import { closeE2eApp, createE2eApp } from './utils/create-e2e-app';
import { generateTotpCode } from '../src/auth/admin-mfa.totp';
import { AuthService, isMfaChallengeResponse } from '../src/auth/auth.service';
import {
  AuthSurface,
  CurrencyCode,
  ProductStatus,
  UserRole,
  UserStatus,
} from '../src/generated/prisma/enums';
import { PrismaService } from '../src/prisma/prisma.service';

/**
 * TTW-163: quantityRange is an inclusive int4range, which Postgres stores with
 * an exclusive upper bound, so the largest integer has no room for that +1.
 * Runs over HTTP because the limit lives in the production validation pipe.
 */
describe('Bulk pricing quantity limits (e2e)', () => {
  const LARGEST_STORABLE = 2147483646;
  const LARGEST_INTEGER = 2147483647;
  const ABOVE_INTEGER_RANGE = 2147483648;
  const TOO_LARGE = /must be 2147483646 or less/;

  let app: INestApplication<App>;
  let prisma: PrismaService;
  let authService: AuthService;
  let adminAuth: string;
  let adminId: string;
  let categoryId: string;
  const productIds: string[] = [];

  beforeAll(async () => {
    app = await createE2eApp();
    prisma = app.get(PrismaService);
    authService = app.get(AuthService);

    const suffix = `limits-${Date.now()}`;
    const password = 'TestPassword1!';
    const email = `bulk-${suffix}@example.com`;
    const admin = await prisma.user.create({
      data: {
        email,
        passwordHash: await bcrypt.hash(password, 10),
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

    const category = await prisma.category.create({
      data: { name: `Limits Cat ${suffix}`, slug: `limits-cat-${suffix}` },
    });
    categoryId = category.id;
  });

  afterAll(async () => {
    await prisma.product.deleteMany({ where: { id: { in: productIds } } });
    await prisma.category.delete({ where: { id: categoryId } });
    await prisma.authSession.deleteMany({ where: { userId: adminId } });
    await prisma.user.delete({ where: { id: adminId } });
    await closeE2eApp(app);
  });

  async function seedProduct() {
    const suffix = `${Date.now()}-${productIds.length}`;
    const product = await prisma.product.create({
      data: {
        name: `Limits Product ${suffix}`,
        slug: `limits-product-${suffix}`,
        status: ProductStatus.ACTIVE,
        categoryId,
      },
    });
    productIds.push(product.id);
    return product.id;
  }

  function createTier(body: Record<string, unknown>) {
    return request(app.getHttpServer())
      .post('/v1/admin/bulk-pricing')
      .set('Authorization', adminAuth)
      .send({ currency: CurrencyCode.NGN, pricePerUnit: 1000, ...body });
  }

  function updateTier(id: string, body: Record<string, unknown>) {
    return request(app.getHttpServer())
      .patch(`/v1/admin/bulk-pricing/${id}`)
      .set('Authorization', adminAuth)
      .send(body);
  }

  function expectQuantityRejected(
    res: { status: number; text: string },
    field: string,
  ) {
    expect(res.status).toBe(400);
    expect(res.text).toMatch(new RegExp(field));
    expect(res.text).toMatch(TOO_LARGE);
  }

  describe('creating a tier', () => {
    it.each([LARGEST_INTEGER, ABOVE_INTEGER_RANGE])(
      'rejects a maxQuantity of %d and stores nothing',
      async (maxQuantity) => {
        const productId = await seedProduct();

        const res = await createTier({
          productId,
          minQuantity: 1,
          maxQuantity,
        });

        expectQuantityRejected(res, 'maxQuantity');
        await expect(
          prisma.bulkPricing.count({ where: { productId } }),
        ).resolves.toBe(0);
      },
    );

    it.each([LARGEST_INTEGER, ABOVE_INTEGER_RANGE])(
      'rejects a minQuantity of %d and stores nothing',
      async (minQuantity) => {
        const productId = await seedProduct();

        const res = await createTier({ productId, minQuantity });

        expectQuantityRejected(res, 'minQuantity');
        await expect(
          prisma.bulkPricing.count({ where: { productId } }),
        ).resolves.toBe(0);
      },
    );

    it('stores the largest quantity the range can hold', async () => {
      const productId = await seedProduct();

      const res = await createTier({
        productId,
        minQuantity: 1,
        maxQuantity: LARGEST_STORABLE,
      });

      expect(res.status).toBe(201);
      expect(res.body).toMatchObject({
        productId,
        maxQuantity: LARGEST_STORABLE,
      });
      const [row] = await prisma.$queryRaw<{ quantityRange: string }[]>`
        SELECT "quantityRange"::text AS "quantityRange"
        FROM "bulk_pricing"
        WHERE "id" = ${res.body.id as string}
      `;
      expect(row.quantityRange).toBe(`[1,${LARGEST_INTEGER})`);
    });

    it('still stores a tier with no maximum', async () => {
      const productId = await seedProduct();

      const res = await createTier({ productId, minQuantity: 100 });

      expect(res.status).toBe(201);
      expect(res.body).toMatchObject({ minQuantity: 100, maxQuantity: null });
    });
  });

  describe('updating a tier', () => {
    async function seedTier() {
      const productId = await seedProduct();
      const res = await createTier({
        productId,
        minQuantity: 1,
        maxQuantity: 10,
      });
      expect(res.status).toBe(201);
      return res.body.id as string;
    }

    async function expectTierUnchanged(id: string) {
      await expect(
        prisma.bulkPricing.findUniqueOrThrow({ where: { id } }),
      ).resolves.toMatchObject({ minQuantity: 1, maxQuantity: 10 });
    }

    it.each([LARGEST_INTEGER, ABOVE_INTEGER_RANGE])(
      'rejects a maxQuantity of %d and keeps the tier as it was',
      async (maxQuantity) => {
        const id = await seedTier();

        const res = await updateTier(id, { maxQuantity });

        expectQuantityRejected(res, 'maxQuantity');
        await expectTierUnchanged(id);
      },
    );

    it.each([LARGEST_INTEGER, ABOVE_INTEGER_RANGE])(
      'rejects a minQuantity of %d and keeps the tier as it was',
      async (minQuantity) => {
        const id = await seedTier();

        const res = await updateTier(id, { minQuantity });

        expectQuantityRejected(res, 'minQuantity');
        await expectTierUnchanged(id);
      },
    );

    it('accepts the largest quantity the range can hold', async () => {
      const id = await seedTier();

      const res = await updateTier(id, { maxQuantity: LARGEST_STORABLE });

      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({ maxQuantity: LARGEST_STORABLE });
    });

    it('still clears a maximum', async () => {
      const id = await seedTier();

      const res = await updateTier(id, { maxQuantity: null });

      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({ maxQuantity: null });
    });
  });
});
