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
const UNPUBLISHED = [ProductStatus.DRAFT, ProductStatus.ARCHIVED];

/**
 * TTW-273: the public workshop route hides unpublished products from everyone.
 * Runs the production AppModule against real Postgres.
 */
describe('Workshop route and unpublished products (e2e)', () => {
  const suffix = `${Date.now()}`;
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let ownerId: string;
  let ownerAuth: string;
  let adminAuth: string;
  let categoryId: string;
  let seq = 0;
  const createdUserIds: string[] = [];

  const server = () => app.getHttpServer();

  async function makeUser(role: UserRole, label: string) {
    const email = `workshop-${label}-${suffix}@example.com`;
    const user = await prisma.user.create({
      data: {
        email,
        passwordHash: await bcrypt.hash(PASSWORD, 10),
        role,
        status: UserStatus.ACTIVE,
        emailVerifiedAt: new Date(),
        firstName: 'Workshop',
        lastName: label,
      },
    });
    createdUserIds.push(user.id);
    return { id: user.id, email };
  }

  function seedProduct(status: ProductStatus) {
    const label = `${suffix}-${++seq}`;
    return prisma.product.create({
      data: {
        categoryId,
        name: `Workshop Product ${label}`,
        slug: `workshop-product-${label}`,
        status,
        views: { create: { key: 'front', displayName: 'Front' } },
      },
    });
  }

  function seedDesign(productId: string, name: string) {
    return prisma.design.create({
      data: { userId: ownerId, productId, name, designData: { views: {} } },
    });
  }

  const workshop = (productId: string, auth?: string) =>
    request(server())
      .get(`/v1/products/${productId}/workshop`)
      .set(auth ? { Authorization: auth } : {});

  beforeAll(async () => {
    app = await createE2eApp();
    prisma = app.get(PrismaService);
    const authService = app.get(AuthService);

    const category = await prisma.category.create({
      data: {
        name: `Workshop Cat ${suffix}`,
        slug: `workshop-cat-${suffix}`,
      },
    });
    categoryId = category.id;

    const owner = await makeUser(UserRole.CUSTOMER, 'owner');
    ownerId = owner.id;
    const login = await authService.login(
      { email: owner.email, password: PASSWORD },
      AuthSurface.CUSTOMER,
    );
    if (isMfaChallengeResponse(login)) {
      throw new Error('customer must not need MFA');
    }
    ownerAuth = `Bearer ${login.access_token}`;

    const admin = await makeUser(UserRole.ADMIN, 'admin');
    const challenge = await authService.login(
      { email: admin.email, password: PASSWORD },
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
  });

  afterAll(async () => {
    await prisma.auditLog.deleteMany({
      where: { actorUserId: { in: createdUserIds } },
    });
    await prisma.design.deleteMany({
      where: { userId: { in: createdUserIds } },
    });
    await prisma.product.deleteMany({ where: { categoryId } });
    await prisma.category.deleteMany({ where: { id: categoryId } });
    await prisma.authSession.deleteMany({
      where: { userId: { in: createdUserIds } },
    });
    await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
    await closeE2eApp(app);
  });

  it('serves the workshop of a published product to anyone', async () => {
    const product = await seedProduct(ProductStatus.ACTIVE);

    const res = await workshop(product.id).expect(200);

    expect(res.body.product).toEqual({
      id: product.id,
      name: product.name,
      slug: product.slug,
      options: [],
    });
    expect(res.body.views.map((view: { key: string }) => view.key)).toEqual([
      'front',
    ]);
  });

  it('answers 404 for an unknown product', async () => {
    await workshop('no-such-product').expect(404);
  });

  describe.each(UNPUBLISHED)('a %s product', (status) => {
    it.each([
      { who: 'an anonymous caller', auth: () => undefined },
      { who: 'the owner of a design on it', auth: () => ownerAuth },
      { who: 'an admin', auth: () => adminAuth },
    ])('is not found for $who', async ({ auth }) => {
      const product = await seedProduct(status);
      await seedDesign(product.id, 'Saved design');

      const unknown = await workshop('no-such-product', auth()).expect(404);
      const res = await workshop(product.id, auth()).expect(404);

      // Same answer as an unknown id: nothing says the product exists.
      expect(res.body.message).toBe(unknown.body.message);
      expect(JSON.stringify(res.body)).not.toContain(product.name);
    });
  });

  it('hides the workshop while the product is withdrawn, and keeps the design', async () => {
    const product = await seedProduct(ProductStatus.ACTIVE);
    const design = await seedDesign(product.id, 'Kept design');
    const setStatus = (status: ProductStatus) =>
      request(server())
        .patch(`/v1/admin/products/${product.id}`)
        .set('Authorization', adminAuth)
        .send({ status })
        .expect(200);

    await setStatus(ProductStatus.ARCHIVED);
    await workshop(product.id).expect(404);
    const saved = await request(server())
      .get(`/v1/designs/${design.id}`)
      .set('Authorization', ownerAuth)
      .expect(200);
    expect(saved.body.name).toBe('Kept design');

    await setStatus(ProductStatus.ACTIVE);
    await workshop(product.id).expect(200);
  });
});
