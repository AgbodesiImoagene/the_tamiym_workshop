import {
  INestApplication,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import request from 'supertest';
import { App } from 'supertest/types';
import { AuthService } from '../src/auth/auth.service';
import { PrismaService } from '../src/prisma/prisma.service';
import { ProductLikesService } from '../src/products/product-likes.service';
import {
  AuthSurface,
  ProductStatus,
  UserRole,
  UserStatus,
} from '../src/generated/prisma/enums';
import { closeE2eApp, createE2eApp } from './utils/create-e2e-app';

const PASSWORD = 'TestPassword1!';
const APP_ORIGIN = 'http://localhost:3002';

interface LikeState {
  productId: string;
  likedByMe: boolean;
  likeCount: number;
}

interface Tier {
  minQuantity: number;
  maxQuantity: number | null;
  pricePerUnit: number;
  currency: string;
}

interface Detail {
  likeCount: number;
  bulkPricingTiers: Tier[];
  variants: Array<{ id: string; bulkPricingTiers: Tier[] }>;
}

describe('Product likes and bulk tiers (e2e, TTW-269)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let authService: AuthService;
  let passwordHash: string;
  let categoryId: string;
  const productIds: string[] = [];
  const run = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  let sequence = 0;

  beforeAll(async () => {
    app = await createE2eApp();
    // One listening server: parallel requests then reach the same one.
    await app.listen(0);
    prisma = app.get(PrismaService);
    authService = app.get(AuthService);
    passwordHash = await bcrypt.hash(PASSWORD, 10);
    const category = await prisma.category.create({
      data: { name: `Likes ${run}`, slug: `likes-${run}` },
    });
    categoryId = category.id;
  });

  afterAll(async () => {
    if (prisma) {
      await prisma.product.deleteMany({ where: { id: { in: productIds } } });
      await prisma.category.deleteMany({ where: { id: categoryId } });
    }
    await closeE2eApp(app);
  });

  async function product(status: ProductStatus = ProductStatus.ACTIVE) {
    sequence += 1;
    const created = await prisma.product.create({
      data: {
        categoryId,
        name: `Liked tee ${sequence}`,
        slug: `liked-tee-${run}-${sequence}`,
        status,
      },
    });
    productIds.push(created.id);
    return created;
  }

  async function customer() {
    sequence += 1;
    const user = await prisma.user.create({
      data: {
        email: `likes-${run}-${sequence}@example.com`,
        passwordHash,
        role: UserRole.CUSTOMER,
        status: UserStatus.ACTIVE,
        firstName: 'Lika',
        lastName: 'Ble',
        emailVerifiedAt: new Date(),
      },
    });
    const session = await authService.login(
      { email: user.email, password: PASSWORD },
      AuthSurface.CUSTOMER,
    );
    return { user, token: session.access_token };
  }

  const server = () => request(app.getHttpServer());
  const path = (id: string) => `/v1/products/${id}/like`;
  const bearer = (token: string) => `Bearer ${token}`;
  const read = (token: string, id: string) =>
    server().get(path(id)).set('Authorization', bearer(token));
  const like = (token: string, id: string) =>
    server().put(path(id)).set('Authorization', bearer(token));
  const unlike = (token: string, id: string) =>
    server().delete(path(id)).set('Authorization', bearer(token));
  const detail = async (id: string) =>
    (await server().get(`/v1/products/${id}`).expect(200)).body as Detail;
  const rows = (productId: string) =>
    prisma.productLike.count({ where: { productId } });

  describe('access', () => {
    it('refuses a visitor and an invalid session on the three routes, and writes nothing', async () => {
      const tee = await product();

      await server().get(path(tee.id)).expect(401);
      await server().put(path(tee.id)).expect(401);
      await server().delete(path(tee.id)).expect(401);
      await read('not-a-token', tee.id).expect(401);
      await like('not-a-token', tee.id).expect(401);

      expect(await rows(tee.id)).toBe(0);
    });

    it('requires the CSRF token for a browser session', async () => {
      const tee = await product();
      const { token } = await customer();
      const cookie = `ttw_customer_access=${token}; ttw_customer_csrf=csrf-value`;

      for (const method of ['put', 'delete'] as const) {
        await server()
          [method](path(tee.id))
          .set('Origin', APP_ORIGIN)
          .set('Cookie', cookie)
          .expect(403);
      }
      expect(await rows(tee.id)).toBe(0);

      await server()
        .put(path(tee.id))
        .set('Origin', APP_ORIGIN)
        .set('Cookie', cookie)
        .set('x-csrf-token', 'csrf-value')
        .expect(200);
      const state = await server()
        .get(path(tee.id))
        .set('Origin', APP_ORIGIN)
        .set('Cookie', cookie)
        .expect(200);
      expect((state.body as LikeState).likedByMe).toBe(true);

      await server()
        .delete(path(tee.id))
        .set('Origin', APP_ORIGIN)
        .set('Cookie', cookie)
        .set('x-csrf-token', 'csrf-value')
        .expect(200);
      expect(await rows(tee.id)).toBe(0);
    });

    it('answers 404 for an unknown, draft or archived product', async () => {
      const { token } = await customer();
      const draft = await product(ProductStatus.DRAFT);
      const archived = await product(ProductStatus.ARCHIVED);

      for (const id of ['unknown-product', draft.id, archived.id]) {
        await read(token, id).expect(404);
        await like(token, id).expect(404);
        await unlike(token, id).expect(404);
      }
      expect(await rows(draft.id)).toBe(0);
      expect(await rows(archived.id)).toBe(0);
    });
  });

  describe('like and unlike', () => {
    it('likes once however often it is repeated, and removes the like the same way', async () => {
      const tee = await product();
      const { token } = await customer();

      expect((await read(token, tee.id).expect(200)).body).toEqual({
        productId: tee.id,
        likedByMe: false,
        likeCount: 0,
      });
      const liked = { productId: tee.id, likedByMe: true, likeCount: 1 };
      expect((await like(token, tee.id).expect(200)).body).toEqual(liked);
      expect((await like(token, tee.id).expect(200)).body).toEqual(liked);
      expect(await rows(tee.id)).toBe(1);

      const removed = { productId: tee.id, likedByMe: false, likeCount: 0 };
      expect((await unlike(token, tee.id).expect(200)).body).toEqual(removed);
      expect((await unlike(token, tee.id).expect(200)).body).toEqual(removed);
      expect(await rows(tee.id)).toBe(0);
    });

    it("counts one like per customer and never touches another customer's like", async () => {
      const tee = await product();
      const first = await customer();
      const second = await customer();

      await like(first.token, tee.id).expect(200);
      expect((await read(second.token, tee.id).expect(200)).body).toMatchObject(
        { likedByMe: false, likeCount: 1 },
      );
      await unlike(second.token, tee.id).expect(200);
      expect(await rows(tee.id)).toBe(1);

      expect((await like(second.token, tee.id).expect(200)).body).toMatchObject(
        { likedByMe: true, likeCount: 2 },
      );
    });

    it('takes the user from the session, never from the request', async () => {
      const tee = await product();
      const caller = await customer();
      const other = await customer();

      await like(caller.token, tee.id)
        .query({ userId: other.user.id })
        .send({ userId: other.user.id })
        .expect(200);

      const stored = await prisma.productLike.findMany({
        where: { productId: tee.id },
      });
      expect(stored.map((row) => row.userId)).toEqual([caller.user.id]);
    });

    it('keeps the likes of each product apart', async () => {
      const tee = await product();
      const hoodie = await product();
      const { token } = await customer();

      await like(token, tee.id).expect(200);

      expect((await read(token, hoodie.id).expect(200)).body).toMatchObject({
        likedByMe: false,
        likeCount: 0,
      });
    });
  });

  describe('concurrency (real Postgres)', () => {
    it('refuses a second row for the same user and product in the database itself', async () => {
      const tee = await product();
      const { user } = await customer();
      const data = { userId: user.id, productId: tee.id };
      await prisma.productLike.create({ data });

      await expect(prisma.productLike.create({ data })).rejects.toMatchObject({
        code: 'P2002',
      });
      expect(await rows(tee.id)).toBe(1);
    });

    it('stores one like when the same customer sends twenty at once', async () => {
      const tee = await product();
      const { token } = await customer();

      const responses = await Promise.all(
        Array.from({ length: 20 }, () => like(token, tee.id)),
      );

      expect(responses.map((res) => res.status)).toEqual(
        Array.from({ length: 20 }, () => 200),
      );
      for (const res of responses) {
        expect(res.body).toMatchObject({ likedByMe: true, likeCount: 1 });
      }
      expect(await rows(tee.id)).toBe(1);
    });

    it('overlapping inserts of one like never raise', async () => {
      // Straight to the service: without the session checks of each HTTP request in
      // between, the writes really overlap in Postgres.
      const likes = app.get(ProductLikesService);
      for (let round = 0; round < 5; round += 1) {
        const tee = await product();
        const { user } = await customer();

        const results = await Promise.allSettled(
          Array.from({ length: 20 }, () => likes.like(user.id, tee.id)),
        );

        expect(results.filter((one) => one.status === 'rejected')).toEqual([]);
        expect(await rows(tee.id)).toBe(1);
      }
    });

    it('survives likes and unlikes sent at once, with at most one row left', async () => {
      const tee = await product();
      const { token } = await customer();

      const responses = await Promise.all(
        Array.from({ length: 20 }, (_, index) =>
          index % 2 === 0 ? like(token, tee.id) : unlike(token, tee.id),
        ),
      );

      expect(responses.filter((res) => res.status !== 200)).toEqual([]);
      const left = await rows(tee.id);
      expect(left).toBeLessThanOrEqual(1);
      expect((await read(token, tee.id).expect(200)).body).toMatchObject({
        likedByMe: left === 1,
        likeCount: left,
      });
    });

    it('counts exactly the customers who like at the same time', async () => {
      const tee = await product();
      const customers = [];
      for (let index = 0; index < 8; index += 1) {
        customers.push(await customer());
      }

      const responses = await Promise.all(
        customers.flatMap(({ token }) => [
          like(token, tee.id),
          like(token, tee.id),
        ]),
      );

      expect(responses.filter((res) => res.status !== 200)).toEqual([]);
      expect(await rows(tee.id)).toBe(8);
      expect((await detail(tee.id)).likeCount).toBe(8);
    });
  });

  describe('product detail', () => {
    it('shows the like count to everyone and never who liked', async () => {
      const tee = await product();
      const first = await customer();
      const second = await customer();
      expect((await detail(tee.id)).likeCount).toBe(0);

      await like(first.token, tee.id).expect(200);
      await like(second.token, tee.id).expect(200);

      const anonymous = await detail(tee.id);
      expect(anonymous.likeCount).toBe(2);
      const body = JSON.stringify(anonymous);
      expect(body).not.toContain(first.user.id);
      expect(body).not.toContain('likedByMe');
      const signedIn = await server()
        .get(`/v1/products/${tee.id}`)
        .set('Authorization', bearer(first.token))
        .expect(200);
      expect(signedIn.body).toEqual(anonymous);
    });

    it('returns empty tier lists for a product without bulk pricing', async () => {
      const tee = await product();
      await prisma.productVariant.create({
        data: { productId: tee.id, name: 'One', sku: `ONE-${run}` },
      });

      const body = await detail(tee.id);

      expect(body.bulkPricingTiers).toEqual([]);
      expect(body.variants[0].bulkPricingTiers).toEqual([]);
    });

    it('returns product tiers and variant tiers apart, lowest quantity first', async () => {
      const tee = await product();
      const own = await prisma.productVariant.create({
        data: { productId: tee.id, name: 'XL', sku: `XL-${run}` },
      });
      const plain = await prisma.productVariant.create({
        data: { productId: tee.id, name: 'S', sku: `S-${run}` },
      });
      // Written highest first, to prove the order comes from the API.
      await prisma.bulkPricing.create({
        data: { productId: tee.id, minQuantity: 50, pricePerUnit: 4000 },
      });
      await prisma.bulkPricing.create({
        data: {
          productId: tee.id,
          minQuantity: 10,
          maxQuantity: 49,
          pricePerUnit: 4500,
        },
      });
      await prisma.bulkPricing.create({
        data: {
          productId: tee.id,
          variantId: own.id,
          minQuantity: 5,
          pricePerUnit: 4200.5,
        },
      });

      const body = await detail(tee.id);

      expect(body.bulkPricingTiers).toEqual([
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
      const byId = new Map(body.variants.map((entry) => [entry.id, entry]));
      expect(byId.get(own.id)?.bulkPricingTiers).toEqual([
        {
          minQuantity: 5,
          maxQuantity: null,
          pricePerUnit: 4200.5,
          currency: 'NGN',
        },
      ]);
      expect(byId.get(plain.id)?.bulkPricingTiers).toEqual([]);
    });
  });

  describe('lifecycle', () => {
    it('answers 404 when the product disappears between the check and the insert', async () => {
      const likes = app.get(ProductLikesService);
      const { user } = await customer();
      // The check passed, then the product was gone: Postgres refuses the foreign key.
      jest
        .spyOn(
          likes as unknown as { assertActiveProduct: () => Promise<void> },
          'assertActiveProduct',
        )
        .mockResolvedValueOnce(undefined);

      await expect(likes.like(user.id, 'vanished')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('writes no like for an account whose erasure is not yet committed', async () => {
      const likes = app.get(ProductLikesService);
      const tee = await product();
      const { user } = await customer();
      let attempt: Promise<unknown> | undefined;

      await prisma.$transaction(async (tx) => {
        // As in the erasure: the account is tombstoned first, then its likes go.
        await tx.user.update({
          where: { id: user.id },
          data: {
            status: UserStatus.DELETED,
            email: `erased-${user.id}@example.com`,
          },
        });
        await tx.productLike.deleteMany({ where: { userId: user.id } });
        // A request that passed the session check just before.
        attempt = likes.like(user.id, tee.id).then(
          () => 'liked',
          (error: unknown) => error,
        );
        await new Promise((resolve) => setTimeout(resolve, 500));
      });

      expect(await attempt).toBeInstanceOf(UnauthorizedException);
      expect(await rows(tee.id)).toBe(0);
    });

    it('deletes the likes with the product', async () => {
      const tee = await product();
      const { token } = await customer();
      await like(token, tee.id).expect(200);

      await prisma.product.delete({ where: { id: tee.id } });

      expect(await rows(tee.id)).toBe(0);
    });

    it('lists the likes in the data export, then removes them with the account', async () => {
      const tee = await product();
      const leaving = await customer();
      const staying = await customer();
      await like(leaving.token, tee.id).expect(200);
      await like(staying.token, tee.id).expect(200);

      const requested = await server()
        .post('/v1/privacy/export')
        .set('Authorization', bearer(leaving.token))
        .send({ password: PASSWORD })
        .expect(201);
      const download = await server()
        .post(
          `/v1/privacy/requests/${(requested.body as { id: string }).id}/export`,
        )
        .set('Authorization', bearer(leaving.token))
        .send({ password: PASSWORD })
        .expect(200);
      const { likes } = (
        download.body as {
          data: { likes: Array<{ productId: string; createdAt: string }> };
        }
      ).data;
      expect(likes).toEqual([
        { productId: tee.id, createdAt: expect.any(String) as string },
      ]);

      await server()
        .post('/v1/privacy/erasure')
        .set('Authorization', bearer(leaving.token))
        .send({ password: PASSWORD })
        .expect(200);

      const left = await prisma.productLike.findMany({
        where: { productId: tee.id },
      });
      expect(left.map((row) => row.userId)).toEqual([staying.user.id]);
      expect((await detail(tee.id)).likeCount).toBe(1);
    });
  });
});
