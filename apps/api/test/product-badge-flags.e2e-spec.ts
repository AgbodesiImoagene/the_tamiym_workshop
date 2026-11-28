import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import * as bcrypt from 'bcrypt';
import { closeE2eApp, createE2eApp } from './utils/create-e2e-app';
import { generateTotpCode } from '../src/auth/admin-mfa.totp';
import { AuthService, isMfaChallengeResponse } from '../src/auth/auth.service';
import { PrismaService } from '../src/prisma/prisma.service';
import {
  AuthSurface,
  ProductStatus,
  UserRole,
  UserStatus,
} from '../src/generated/prisma/enums';

const PASSWORD = 'TestPassword1!';
const OFF = { isBestSeller: false, expressProduction: false };

type Flags = typeof OFF;

/**
 * TTW-267: the "Best Seller" and express production flags. Runs the production
 * AppModule against real Postgres: column defaults, routes, guards, DTO
 * validation and the customer and admin reads.
 */
describe('Product badge flags (e2e)', () => {
  const suffix = `${Date.now()}`;
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let adminAuth: string;
  let customerAuth: string;
  let categoryId: string;
  let seq = 0;
  const createdUserIds: string[] = [];

  const server = () => app.getHttpServer();

  async function makeUser(role: UserRole, label: string) {
    const email = `badge-${label}-${suffix}@example.com`;
    const user = await prisma.user.create({
      data: {
        email,
        passwordHash: await bcrypt.hash(PASSWORD, 10),
        role,
        status: UserStatus.ACTIVE,
        emailVerifiedAt: new Date(),
        firstName: 'Badge',
        lastName: label,
      },
    });
    createdUserIds.push(user.id);
    return email;
  }

  /** A product written straight to the database. */
  function seedProduct(
    flags: Partial<Flags> = {},
    status: ProductStatus = ProductStatus.ACTIVE,
  ) {
    const label = `${suffix}-${++seq}`;
    return prisma.product.create({
      data: {
        categoryId,
        name: `Badge Product ${label}`,
        slug: `badge-product-${label}`,
        status,
        ...flags,
      },
    });
  }

  function storedFlags(id: string) {
    return prisma.product.findUniqueOrThrow({
      where: { id },
      select: { isBestSeller: true, expressProduction: true },
    });
  }

  beforeAll(async () => {
    app = await createE2eApp();
    prisma = app.get(PrismaService);
    const authService = app.get(AuthService);

    const category = await prisma.category.create({
      data: {
        name: `Badge Cat ${suffix}`,
        slug: `badge-cat-${suffix}`,
      },
    });
    categoryId = category.id;

    const adminEmail = await makeUser(UserRole.ADMIN, 'admin');
    const challenge = await authService.login(
      { email: adminEmail, password: PASSWORD },
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

    const customerEmail = await makeUser(UserRole.CUSTOMER, 'customer');
    const login = await authService.login(
      { email: customerEmail, password: PASSWORD },
      AuthSurface.CUSTOMER,
    );
    if (isMfaChallengeResponse(login)) {
      throw new Error('customer must not need MFA');
    }
    customerAuth = `Bearer ${login.access_token}`;
  });

  afterAll(async () => {
    await prisma.auditLog.deleteMany({
      where: { actorUserId: { in: createdUserIds } },
    });
    await prisma.product.deleteMany({ where: { categoryId } });
    await prisma.category.deleteMany({ where: { id: categoryId } });
    await prisma.authSession.deleteMany({
      where: { userId: { in: createdUserIds } },
    });
    await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
    await closeE2eApp(app);
  });

  describe('defaults', () => {
    it('leaves both flags off on a row that does not set them', async () => {
      const product = await seedProduct();
      await expect(storedFlags(product.id)).resolves.toEqual(OFF);
    });

    it('creates a product with both flags off when the admin sends none', async () => {
      const res = await request(server())
        .post('/v1/admin/products')
        .set('Authorization', adminAuth)
        .send({ categoryId, name: `Badge Default ${suffix}` })
        .expect(201);

      expect(res.body).toMatchObject(OFF);
      await expect(storedFlags(res.body.id)).resolves.toEqual(OFF);
    });
  });

  describe('admin writes', () => {
    it('creates a product with the flags the admin sends', async () => {
      const on = { isBestSeller: true, expressProduction: true };
      const res = await request(server())
        .post('/v1/admin/products')
        .set('Authorization', adminAuth)
        .send({ categoryId, name: `Badge Flagged ${suffix}`, ...on })
        .expect(201);

      expect(res.body).toMatchObject(on);
      await expect(storedFlags(res.body.id)).resolves.toEqual(on);
    });

    it('turns each flag on and off on its own', async () => {
      const product = await seedProduct();
      const patch = (body: Partial<Flags>) =>
        request(server())
          .patch(`/v1/admin/products/${product.id}`)
          .set('Authorization', adminAuth)
          .send(body)
          .expect(200);

      const first = await patch({ isBestSeller: true });
      expect(first.body).toMatchObject({
        isBestSeller: true,
        expressProduction: false,
      });

      await patch({ expressProduction: true });
      await expect(storedFlags(product.id)).resolves.toEqual({
        isBestSeller: true,
        expressProduction: true,
      });

      await patch({ isBestSeller: false });
      await expect(storedFlags(product.id)).resolves.toEqual({
        isBestSeller: false,
        expressProduction: true,
      });

      await patch({ expressProduction: false });
      await expect(storedFlags(product.id)).resolves.toEqual(OFF);
    });

    it('keeps the flags on an update that does not send them', async () => {
      const on = { isBestSeller: true, expressProduction: true };
      const product = await seedProduct(on);

      await request(server())
        .patch(`/v1/admin/products/${product.id}`)
        .set('Authorization', adminAuth)
        .send({ description: 'Only the description changes' })
        .expect(200);

      await expect(storedFlags(product.id)).resolves.toEqual(on);
    });

    it.each([
      { isBestSeller: 'false' },
      { expressProduction: 'false' },
      { isBestSeller: 1 },
      { expressProduction: null },
    ])('refuses %j and stores nothing', async (body) => {
      const product = await seedProduct();

      await request(server())
        .patch(`/v1/admin/products/${product.id}`)
        .set('Authorization', adminAuth)
        .send(body)
        .expect(400);

      await expect(storedFlags(product.id)).resolves.toEqual(OFF);
    });

    it('returns the flags on the admin list and detail', async () => {
      const product = await seedProduct({ isBestSeller: true });
      const expected = { isBestSeller: true, expressProduction: false };

      const list = await request(server())
        .get('/v1/admin/products')
        .set('Authorization', adminAuth)
        .expect(200);
      expect(
        list.body.find((row: { id: string }) => row.id === product.id),
      ).toMatchObject(expected);

      const detail = await request(server())
        .get(`/v1/admin/products/${product.id}`)
        .set('Authorization', adminAuth)
        .expect(200);
      expect(detail.body).toMatchObject(expected);
    });
  });

  describe('without admin rights', () => {
    const on = { isBestSeller: true, expressProduction: true };

    it.each([
      { who: 'an anonymous caller', status: 401, auth: () => null },
      { who: 'a customer', status: 403, auth: () => customerAuth },
    ])('refuses writes from $who', async ({ status, auth }) => {
      const product = await seedProduct();
      const name = `Badge Intruder ${status} ${suffix}`;
      const header = auth();
      const headers: Record<string, string> = header
        ? { Authorization: header }
        : {};

      // One request at a time: each supertest request opens and closes the server.
      await request(server())
        .patch(`/v1/admin/products/${product.id}`)
        .set(headers)
        .send(on)
        .expect(status);
      await request(server())
        .post('/v1/admin/products')
        .set(headers)
        .send({ categoryId, name, ...on })
        .expect(status);

      await expect(storedFlags(product.id)).resolves.toEqual(OFF);
      await expect(prisma.product.count({ where: { name } })).resolves.toBe(0);
    });

    it('never shows a flagged draft product to customers', async () => {
      const draft = await seedProduct(on, ProductStatus.DRAFT);

      const list = await request(server())
        .get('/v1/products')
        .query({ categoryId, limit: 100 })
        .expect(200);
      expect(list.body.map((row: { id: string }) => row.id)).not.toContain(
        draft.id,
      );
      await request(server()).get(`/v1/products/${draft.id}`).expect(404);
    });
  });

  describe('customer reads', () => {
    it('returns the flags of each product on the list and the detail', async () => {
      const flagged = await seedProduct({ expressProduction: true });
      const plain = await seedProduct();

      const list = await request(server())
        .get('/v1/products')
        .query({ categoryId, limit: 100 })
        .set('Authorization', customerAuth)
        .expect(200);
      const row = (id: string) =>
        list.body.find((item: { id: string }) => item.id === id);
      expect(row(flagged.id)).toMatchObject({
        isBestSeller: false,
        expressProduction: true,
      });
      expect(row(plain.id)).toMatchObject(OFF);

      const detail = await request(server())
        .get(`/v1/products/${flagged.id}`)
        .expect(200);
      expect(detail.body).toMatchObject({
        isBestSeller: false,
        expressProduction: true,
      });
    });
  });
});
