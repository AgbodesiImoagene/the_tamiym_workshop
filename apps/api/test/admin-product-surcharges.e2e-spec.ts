import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import * as bcrypt from 'bcrypt';
import { closeE2eApp, createE2eApp } from './utils/create-e2e-app';
import { generateTotpCode } from '../src/auth/admin-mfa.totp';
import { AuthService, isMfaChallengeResponse } from '../src/auth/auth.service';
import { OrdersService } from '../src/orders/orders.service';
import { PricingService } from '../src/pricing/pricing.service';
import { PrismaService } from '../src/prisma/prisma.service';
import {
  AuthSurface,
  CurrencyCode,
  ProductStatus,
  ShippingRateProvider,
  ShippingRuleMatchType,
  UserRole,
  UserStatus,
} from '../src/generated/prisma/enums';

const PASSWORD = 'TestPassword1!';

/**
 * TTW-094: admins write size (option value) upcharges and per-view print
 * surcharges. Runs the production AppModule against real Postgres: routes,
 * guards, DTO validation, the unique indexes and the pricing read path.
 */
describe('Admin product surcharges (e2e)', () => {
  const suffix = `${Date.now()}`;
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let pricing: PricingService;
  let orders: OrdersService;
  let adminAuth: string;
  let customerAuth: string;
  let adminId: string;
  let previousTaxSettings: Awaited<ReturnType<typeof readTaxSettings>>;

  const createdProductIds: string[] = [];
  const createdCategoryIds: string[] = [];
  let seq = 0;
  const createdUserIds: string[] = [];
  const createdZoneIds: string[] = [];

  function readTaxSettings() {
    return prisma.siteSettings.findUnique({
      where: { id: 'default' },
      select: {
        vatRate: true,
        pricesIncludeVat: true,
        vatAppliesToShipping: true,
        currency: true,
      },
    });
  }

  async function makeUser(role: UserRole, label: string) {
    const email = `surcharge-${label}-${suffix}@example.com`;
    const user = await prisma.user.create({
      data: {
        email,
        passwordHash: await bcrypt.hash(PASSWORD, 10),
        role,
        status: UserStatus.ACTIVE,
        emailVerifiedAt: new Date(),
        firstName: 'Surcharge',
        lastName: label,
      },
    });
    createdUserIds.push(user.id);
    return { user, email };
  }

  /** A product with a Size option (M, XXL), one variant per size, and two views. */
  async function seedProduct(baseLabel: string) {
    const label = `${baseLabel}-${++seq}`;
    const category = await prisma.category.create({
      data: {
        name: `Surcharge Cat ${label} ${suffix}`,
        slug: `surcharge-cat-${label}-${suffix}`,
      },
    });
    const product = await prisma.product.create({
      data: {
        name: `Surcharge Product ${label}`,
        slug: `surcharge-product-${label}-${suffix}`,
        status: ProductStatus.ACTIVE,
        categoryId: category.id,
        prices: { create: { currency: CurrencyCode.NGN, amount: 5000 } },
      },
    });
    createdProductIds.push(product.id);
    createdCategoryIds.push(category.id);
    const option = await prisma.productOption.create({
      data: { productId: product.id, code: 'size', name: 'Size' },
    });
    const sizeM = await prisma.productOptionValue.create({
      data: { optionId: option.id, valueCode: 'M', displayName: 'Medium' },
    });
    const sizeXxl = await prisma.productOptionValue.create({
      data: { optionId: option.id, valueCode: 'XXL', displayName: 'XXL' },
    });
    const variantXxl = await prisma.productVariant.create({
      data: {
        productId: product.id,
        name: 'XXL',
        sku: `SKU-SUR-${label}-${suffix}-XXL`,
      },
    });
    await prisma.variantOptionValue.create({
      data: {
        variantId: variantXxl.id,
        optionId: option.id,
        optionValueId: sizeXxl.id,
      },
    });
    await prisma.inventoryItem.create({
      data: {
        variantId: variantXxl.id,
        stockOnHand: 20,
        reserved: 0,
        trackInventory: true,
        lowStockThreshold: 0,
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
    return { product, option, sizeM, sizeXxl, variantXxl, front, back };
  }

  async function seedShopper(label: string) {
    const { user } = await makeUser(UserRole.CUSTOMER, `shopper-${label}`);
    await prisma.geoState.upsert({
      where: { code: 'LA' },
      update: { isActive: true },
      create: { code: 'LA', name: 'Lagos', isActive: true },
    });
    const zone = await prisma.shippingZone.create({
      data: { name: `Surcharge Lagos ${label} ${suffix}`, isActive: true },
    });
    createdZoneIds.push(zone.id);
    await prisma.shippingZoneRule.create({
      data: {
        zoneId: zone.id,
        countryCode: 'NG',
        matchType: ShippingRuleMatchType.ADMIN1,
        matchValue: 'LA',
        priority: 100,
        isActive: true,
      },
    });
    await prisma.shippingRate.create({
      data: {
        zoneId: zone.id,
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
        userId: user.id,
        addressLine1: '1 Surcharge Street',
        city: 'Ikeja',
        state: 'Lagos',
        stateCode: 'LA',
        countryCode: 'NG',
        country: 'Nigeria',
      },
    });
    return { user, address };
  }

  const upchargeUrl = (
    p: { product: { id: string }; option: { id: string } },
    valueId: string,
    currency = 'NGN',
  ) =>
    `/v1/admin/products/${p.product.id}/options/${p.option.id}/values/${valueId}/upcharges/${currency}`;
  const viewUrl = (productId: string, viewId: string, currency = 'NGN') =>
    `/v1/admin/products/${productId}/views/${viewId}/surcharges/${currency}`;

  beforeAll(async () => {
    app = await createE2eApp();
    prisma = app.get(PrismaService);
    pricing = app.get(PricingService);
    orders = app.get(OrdersService);
    const authService = app.get(AuthService);

    previousTaxSettings = await readTaxSettings();
    const pinned = {
      vatRate: 0,
      pricesIncludeVat: true,
      vatAppliesToShipping: true,
      currency: CurrencyCode.NGN,
    };
    await prisma.siteSettings.upsert({
      where: { id: 'default' },
      update: pinned,
      create: { id: 'default', ...pinned },
    });

    const admin = await makeUser(UserRole.ADMIN, 'admin');
    adminId = admin.user.id;
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

    const customer = await makeUser(UserRole.CUSTOMER, 'customer');
    const login = await authService.login(
      { email: customer.email, password: PASSWORD },
      AuthSurface.CUSTOMER,
    );
    if (isMfaChallengeResponse(login)) {
      throw new Error('customer must not need MFA');
    }
    customerAuth = `Bearer ${login.access_token}`;
  });

  afterAll(async () => {
    await prisma.auditLog.deleteMany({
      where: { actorUserId: adminId },
    });
    // Orders reserve stock: their inventory movements point at the variants,
    // so they go before the orders and the products.
    const variants = await prisma.productVariant.findMany({
      where: { productId: { in: createdProductIds } },
      select: { id: true },
    });
    const variantIds = variants.map((v) => v.id);
    await prisma.inventoryMovement.deleteMany({
      where: { variantId: { in: variantIds } },
    });
    await prisma.order.deleteMany({
      where: { userId: { in: createdUserIds } },
    });
    await prisma.product.deleteMany({
      where: { id: { in: createdProductIds } },
    });
    await prisma.category.deleteMany({
      where: { id: { in: createdCategoryIds } },
    });
    await prisma.shippingZone.deleteMany({
      where: { id: { in: createdZoneIds } },
    });
    await prisma.authSession.deleteMany({
      where: { userId: { in: createdUserIds } },
    });
    await prisma.address.deleteMany({
      where: { userId: { in: createdUserIds } },
    });
    await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
    if (previousTaxSettings) {
      await prisma.siteSettings.update({
        where: { id: 'default' },
        data: previousTaxSettings,
      });
    } else {
      await prisma.siteSettings.delete({ where: { id: 'default' } });
    }
    await closeE2eApp(app);
  });

  describe('size upcharge (option value)', () => {
    it('lets an admin set XXL +500 and the customer quote reflects it', async () => {
      const p = await seedProduct('quote');
      const { user, address } = await seedShopper('quote');
      const items = [{ variantId: p.variantXxl.id, quantity: 1 }];

      const before = await pricing.quoteStandard(user.id, {
        shippingAddressId: address.id,
        items,
      });
      expect(before.items[0].unitFinalPrice).toBe(5000);

      const res = await request(app.getHttpServer())
        .put(upchargeUrl(p, p.sizeXxl.id))
        .set('Authorization', adminAuth)
        .send({ amount: 500 })
        .expect(200);
      expect(res.body).toEqual({
        optionId: p.option.id,
        valueId: p.sizeXxl.id,
        currency: 'NGN',
        amount: '500.00',
      });

      const after = await pricing.quoteStandard(user.id, {
        shippingAddressId: address.id,
        items,
      });
      expect(after.items[0].unitFinalPrice).toBe(5500);
      expect(after.items[0].pricingBreakdown.optionValueUpcharge).toBe(500);
    });

    it('replaces the amount on a second PUT and keeps one row', async () => {
      const p = await seedProduct('replace');
      for (const amount of [500, 750.5]) {
        await request(app.getHttpServer())
          .put(upchargeUrl(p, p.sizeXxl.id))
          .set('Authorization', adminAuth)
          .send({ amount })
          .expect(200);
      }
      const rows = await prisma.optionValueUpcharge.findMany({
        where: { optionValueId: p.sizeXxl.id },
      });
      expect(rows).toHaveLength(1);
      expect(rows[0].amount.toFixed(2)).toBe('750.50');
    });

    it('stays one row under concurrent writes for the same value and currency', async () => {
      const p = await seedProduct('race-upcharge');
      const results = await Promise.all(
        Array.from({ length: 10 }, (_, i) =>
          request(app.getHttpServer())
            .put(upchargeUrl(p, p.sizeXxl.id))
            .set('Authorization', adminAuth)
            .send({ amount: 100 + i }),
        ),
      );
      expect(results.map((r) => r.status)).toEqual(Array(10).fill(200));
      const rows = await prisma.optionValueUpcharge.findMany({
        where: { optionValueId: p.sizeXxl.id },
      });
      expect(rows).toHaveLength(1);
      // The survivor is one of the amounts that were sent, never a mix.
      const sent = Array.from({ length: 10 }, (_, i) => (100 + i).toFixed(2));
      expect(sent).toContain(rows[0].amount.toFixed(2));
      // Every accepted write left its own audit entry.
      expect(
        await prisma.auditLog.count({
          where: {
            entityType: 'OptionValueUpcharge',
            entityId: p.sizeXxl.id,
          },
        }),
      ).toBe(10);
    });

    it('deletes the upcharge, and a second delete still succeeds', async () => {
      const p = await seedProduct('delete');
      await request(app.getHttpServer())
        .put(upchargeUrl(p, p.sizeXxl.id))
        .set('Authorization', adminAuth)
        .send({ amount: 500 })
        .expect(200);
      await request(app.getHttpServer())
        .delete(upchargeUrl(p, p.sizeXxl.id))
        .set('Authorization', adminAuth)
        .expect(204);
      await request(app.getHttpServer())
        .delete(upchargeUrl(p, p.sizeXxl.id))
        .set('Authorization', adminAuth)
        .expect(204);
      expect(
        await prisma.optionValueUpcharge.count({
          where: { optionValueId: p.sizeXxl.id },
        }),
      ).toBe(0);
    });

    it('refuses a value that belongs to another product (no cross-product write)', async () => {
      const a = await seedProduct('idor-a');
      const b = await seedProduct('idor-b');
      // Positive control: the same route works for the matching product/value.
      await request(app.getHttpServer())
        .put(upchargeUrl(a, a.sizeXxl.id))
        .set('Authorization', adminAuth)
        .send({ amount: 500 })
        .expect(200);
      await request(app.getHttpServer())
        .put(
          `/v1/admin/products/${a.product.id}/options/${a.option.id}/values/${b.sizeXxl.id}/upcharges/NGN`,
        )
        .set('Authorization', adminAuth)
        .send({ amount: 500 })
        .expect(404);
      expect(
        await prisma.optionValueUpcharge.count({
          where: { optionValueId: b.sizeXxl.id },
        }),
      ).toBe(0);
    });

    it.each([
      ['negative', { amount: -1 }],
      ['three decimals', { amount: 10.123 }],
      ['too large', { amount: 100000000 }],
      ['not a number', { amount: 'abc' }],
      ['missing', {}],
    ])('rejects an invalid amount: %s', async (_label, body) => {
      const p = await seedProduct('invalid');
      await request(app.getHttpServer())
        .put(upchargeUrl(p, p.sizeXxl.id))
        .set('Authorization', adminAuth)
        .send(body)
        .expect(400);
      expect(
        await prisma.optionValueUpcharge.count({
          where: { optionValueId: p.sizeXxl.id },
        }),
      ).toBe(0);
    });

    it('rejects an unknown currency', async () => {
      const p = await seedProduct('currency');
      await request(app.getHttpServer())
        .put(upchargeUrl(p, p.sizeXxl.id, 'XYZ'))
        .set('Authorization', adminAuth)
        .send({ amount: 500 })
        .expect(400);
    });

    it('writes an audit entry with the before and after amounts', async () => {
      const p = await seedProduct('audit');
      await request(app.getHttpServer())
        .put(upchargeUrl(p, p.sizeXxl.id))
        .set('Authorization', adminAuth)
        .send({ amount: 500 })
        .expect(200);
      await request(app.getHttpServer())
        .put(upchargeUrl(p, p.sizeXxl.id))
        .set('Authorization', adminAuth)
        .send({ amount: 900 })
        .expect(200);
      const entries = await prisma.auditLog.findMany({
        where: {
          entityType: 'OptionValueUpcharge',
          entityId: p.sizeXxl.id,
        },
        orderBy: { occurredAt: 'asc' },
      });
      expect(entries.map((e) => e.action)).toEqual(['CREATE', 'UPDATE']);
      expect(entries[1].actorUserId).toBe(adminId);
      expect(entries[1].before).toEqual({ currency: 'NGN', amount: '500.00' });
      expect(entries[1].after).toEqual({ currency: 'NGN', amount: '900.00' });
    });
  });

  describe('print-side surcharge (product view)', () => {
    it('sets a back-print surcharge at product level and lists it', async () => {
      const p = await seedProduct('view');
      const res = await request(app.getHttpServer())
        .put(viewUrl(p.product.id, p.back.id))
        .set('Authorization', adminAuth)
        .send({ amount: 1000 })
        .expect(200);
      expect(res.body).toEqual({
        viewId: p.back.id,
        currency: 'NGN',
        amount: '1000.00',
      });

      const row = await prisma.productViewPricing.findFirstOrThrow({
        where: { productViewId: p.back.id },
      });
      expect(row.variantId).toBeNull();

      const list = await request(app.getHttpServer())
        .get(`/v1/admin/products/${p.product.id}/surcharges`)
        .set('Authorization', adminAuth)
        .expect(200);
      expect(list.body).toEqual({
        optionValueUpcharges: [],
        viewSurcharges: [
          { viewId: p.back.id, currency: 'NGN', amount: '1000.00' },
        ],
      });
    });

    it('keeps exactly one product-level row under concurrent writes', async () => {
      const p = await seedProduct('race-view');
      const results = await Promise.all(
        Array.from({ length: 10 }, (_, i) =>
          request(app.getHttpServer())
            .put(viewUrl(p.product.id, p.back.id))
            .set('Authorization', adminAuth)
            .send({ amount: 1000 + i }),
        ),
      );
      expect(results.map((r) => r.status)).toEqual(Array(10).fill(200));
      const rows = await prisma.productViewPricing.findMany({
        where: { productViewId: p.back.id, variantId: null },
      });
      expect(rows).toHaveLength(1);
      const sent = Array.from({ length: 10 }, (_, i) => (1000 + i).toFixed(2));
      expect(sent).toContain(rows[0].surchargeAmount.toFixed(2));
      expect(
        await prisma.auditLog.count({
          where: { entityType: 'ProductViewPricing', entityId: p.back.id },
        }),
      ).toBe(10);
    });

    it('the database itself refuses a second product-level row (partial unique index)', async () => {
      const p = await seedProduct('db-unique');
      const data = {
        productId: p.product.id,
        productViewId: p.back.id,
        variantId: null,
        currency: CurrencyCode.NGN,
        surchargeAmount: 1000,
      };
      await prisma.productViewPricing.create({ data });
      await expect(
        prisma.productViewPricing.create({ data }),
      ).rejects.toMatchObject({ code: 'P2002' });
    });

    it('does not touch a variant-level override and deletes only the product-level row', async () => {
      const p = await seedProduct('override');
      await prisma.productViewPricing.create({
        data: {
          productId: p.product.id,
          productViewId: p.back.id,
          variantId: p.variantXxl.id,
          currency: CurrencyCode.NGN,
          surchargeAmount: 1500,
        },
      });
      await request(app.getHttpServer())
        .put(viewUrl(p.product.id, p.back.id))
        .set('Authorization', adminAuth)
        .send({ amount: 1000 })
        .expect(200);
      await request(app.getHttpServer())
        .delete(viewUrl(p.product.id, p.back.id))
        .set('Authorization', adminAuth)
        .expect(204);

      const rows = await prisma.productViewPricing.findMany({
        where: { productViewId: p.back.id },
      });
      expect(rows).toHaveLength(1);
      expect(rows[0].variantId).toBe(p.variantXxl.id);
      expect(rows[0].surchargeAmount.toFixed(2)).toBe('1500.00');
    });

    it('refuses a view that belongs to another product', async () => {
      const a = await seedProduct('view-idor-a');
      const b = await seedProduct('view-idor-b');
      // Positive control: the same route works for the matching product/view.
      await request(app.getHttpServer())
        .put(viewUrl(a.product.id, a.back.id))
        .set('Authorization', adminAuth)
        .send({ amount: 1000 })
        .expect(200);
      await request(app.getHttpServer())
        .put(viewUrl(a.product.id, b.back.id))
        .set('Authorization', adminAuth)
        .send({ amount: 1000 })
        .expect(404);
      expect(
        await prisma.productViewPricing.count({
          where: { productViewId: b.back.id },
        }),
      ).toBe(0);
    });
  });

  describe('authorization', () => {
    it('refuses a request without a session (401)', async () => {
      const p = await seedProduct('anon');
      await request(app.getHttpServer())
        .put(upchargeUrl(p, p.sizeXxl.id))
        .send({ amount: 500 })
        .expect(401);
      await request(app.getHttpServer())
        .put(viewUrl(p.product.id, p.back.id))
        .send({ amount: 500 })
        .expect(401);
    });

    it('refuses an admin cookie session that sends no CSRF token (403) and writes nothing', async () => {
      const p = await seedProduct('csrf');
      const adminCookie = `ttw_admin_access=${adminAuth.replace('Bearer ', '')}`;
      const adminOrigin = 'http://localhost:3003';
      await request(app.getHttpServer())
        .put(upchargeUrl(p, p.sizeXxl.id))
        .set('Cookie', adminCookie)
        .set('Origin', adminOrigin)
        .send({ amount: 500 })
        .expect(403);
      await request(app.getHttpServer())
        .put(viewUrl(p.product.id, p.back.id))
        .set('Cookie', adminCookie)
        .set('Origin', adminOrigin)
        .send({ amount: 500 })
        .expect(403);
      await request(app.getHttpServer())
        .delete(viewUrl(p.product.id, p.back.id))
        .set('Cookie', adminCookie)
        .set('Origin', adminOrigin)
        .expect(403);
      expect(
        await prisma.optionValueUpcharge.count({
          where: { optionValueId: p.sizeXxl.id },
        }),
      ).toBe(0);
      expect(
        await prisma.productViewPricing.count({
          where: { productViewId: p.back.id },
        }),
      ).toBe(0);
    });

    it('refuses a customer on every surcharge route (403) and writes nothing', async () => {
      const p = await seedProduct('customer');
      const agent = () => request(app.getHttpServer());
      await agent()
        .put(upchargeUrl(p, p.sizeXxl.id))
        .set('Authorization', customerAuth)
        .send({ amount: 500 })
        .expect(403);
      await agent()
        .delete(upchargeUrl(p, p.sizeXxl.id))
        .set('Authorization', customerAuth)
        .expect(403);
      await agent()
        .put(viewUrl(p.product.id, p.back.id))
        .set('Authorization', customerAuth)
        .send({ amount: 500 })
        .expect(403);
      await agent()
        .delete(viewUrl(p.product.id, p.back.id))
        .set('Authorization', customerAuth)
        .expect(403);
      await agent()
        .get(`/v1/admin/products/${p.product.id}/surcharges`)
        .set('Authorization', customerAuth)
        .expect(403);
      expect(
        await prisma.optionValueUpcharge.count({
          where: { optionValueId: p.sizeXxl.id },
        }),
      ).toBe(0);
    });
  });

  describe('existing data and frozen orders', () => {
    it('quotes the same price as before for a product with no surcharge written', async () => {
      const p = await seedProduct('unchanged');
      const { user, address } = await seedShopper('unchanged');
      const quote = await pricing.quoteStandard(user.id, {
        shippingAddressId: address.id,
        items: [{ variantId: p.variantXxl.id, quantity: 2 }],
      });
      expect(quote.items[0]).toMatchObject({
        unitFinalPrice: 5000,
        lineTotal: 10000,
      });
      expect(quote.items[0].pricingBreakdown.optionValueUpcharge).toBe(0);
    });

    it('never changes an order that already exists when the surcharge changes later', async () => {
      const p = await seedProduct('frozen');
      const { user, address } = await seedShopper('frozen');
      await request(app.getHttpServer())
        .put(upchargeUrl(p, p.sizeXxl.id))
        .set('Authorization', adminAuth)
        .send({ amount: 500 })
        .expect(200);

      const order = await orders.create(user.id, {
        shippingAddressId: address.id,
        items: [{ variantId: p.variantXxl.id, quantity: 1 }],
      });
      const frozenTotal = Number(order.totalAmount);

      await request(app.getHttpServer())
        .put(upchargeUrl(p, p.sizeXxl.id))
        .set('Authorization', adminAuth)
        .send({ amount: 900 })
        .expect(200);

      const reread = await prisma.order.findUniqueOrThrow({
        where: { id: order.id },
        include: { items: true },
      });
      expect(Number(reread.totalAmount)).toBe(frozenTotal);
      expect(Number(reread.items[0].unitFinalPrice)).toBe(5500);

      const fresh = await pricing.quoteStandard(user.id, {
        shippingAddressId: address.id,
        items: [{ variantId: p.variantXxl.id, quantity: 1 }],
      });
      expect(fresh.items[0].unitFinalPrice).toBe(5900);
    });
  });
});
