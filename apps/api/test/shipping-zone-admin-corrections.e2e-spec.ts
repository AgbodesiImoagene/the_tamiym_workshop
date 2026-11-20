import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import * as bcrypt from 'bcrypt';
import { closeE2eApp, createE2eApp } from './utils/create-e2e-app';
import { generateTotpCode } from '../src/auth/admin-mfa.totp';
import { AuthService, isMfaChallengeResponse } from '../src/auth/auth.service';
import { OrdersService } from '../src/orders/orders.service';
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
const LOST = 'SHIPPING_COVERAGE_WOULD_BE_LOST';

/**
 * TTW-097: admins correct and delete shipping zones, rules, rates and areas.
 * Runs the production AppModule against real Postgres: guards, routes, the
 * coverage warning and the audit trail. Each test owns a unique state so rules
 * left by other suites cannot cover or shadow it.
 */
describe('Admin shipping corrections (e2e)', () => {
  const suffix = `${Date.now()}`;
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let orders: OrdersService;
  let adminAuth: string;
  let customerAuth: string;
  let seq = 0;
  const zoneIds: string[] = [];
  const stateCodes: string[] = [];
  const userIds: string[] = [];

  async function makeUser(role: UserRole, label: string) {
    const email = `ship-fix-${label}-${suffix}@example.com`;
    const user = await prisma.user.create({
      data: {
        email,
        passwordHash: await bcrypt.hash(PASSWORD, 10),
        role,
        status: UserStatus.ACTIVE,
        emailVerifiedAt: new Date(),
        firstName: 'Ship',
        lastName: label,
      },
    });
    userIds.push(user.id);
    return { user, email };
  }

  /** A fresh state (unique code) so coverage is not shared with other suites. */
  async function seedState() {
    const code = `Y${suffix}-${++seq}`;
    await prisma.geoState.create({
      data: { code, name: `Fix State ${code} ${suffix}`, isActive: true },
    });
    stateCodes.push(code);
    return code;
  }

  /** A zone covering `stateCode` (area + ADMIN1 rule) with one active rate. */
  async function seedCoveredZone(stateCode: string, flatFee = 1500) {
    const zone = await prisma.shippingZone.create({
      data: { name: `Fix Zone ${stateCode} ${suffix}`, isActive: true },
    });
    zoneIds.push(zone.id);
    const area = await prisma.shippingZoneArea.create({
      data: { zoneId: zone.id, stateCode },
    });
    const rule = await prisma.shippingZoneRule.create({
      data: {
        zoneId: zone.id,
        countryCode: 'NG',
        matchType: ShippingRuleMatchType.ADMIN1,
        matchValue: stateCode,
        priority: 200,
        isActive: true,
      },
    });
    const rate = await prisma.shippingRate.create({
      data: {
        zoneId: zone.id,
        provider: ShippingRateProvider.INTERNAL,
        serviceLevel: 'STANDARD',
        currency: CurrencyCode.NGN,
        flatFee,
        priority: 100,
        isActive: true,
      },
    });
    return { zone, area, rule, rate };
  }

  const asAdmin = (req: request.Test) => req.set('Authorization', adminAuth);

  beforeAll(async () => {
    app = await createE2eApp();
    prisma = app.get(PrismaService);
    orders = app.get(OrdersService);
    const authService = app.get(AuthService);

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
      where: {
        OR: [{ entityId: { in: zoneIds } }, { targetId: { in: zoneIds } }],
      },
    });
    await prisma.shippingZone.deleteMany({ where: { id: { in: zoneIds } } });
    await prisma.geoState.deleteMany({ where: { code: { in: stateCodes } } });
    await closeE2eApp(app);
  });

  describe('authorization', () => {
    it('refuses anonymous callers (401) and customers (403) on every correction route, and writes nothing', async () => {
      const state = await seedState();
      const { zone, area, rule, rate } = await seedCoveredZone(state);
      const routes: Array<[string, string]> = [
        ['patch', `/v1/admin/shipping-rates/${rate.id}`],
        ['delete', `/v1/admin/shipping-rates/${rate.id}`],
        ['patch', `/v1/admin/shipping-rules/${rule.id}`],
        ['delete', `/v1/admin/shipping-rules/${rule.id}`],
        ['patch', `/v1/admin/shipping-zones/${zone.id}`],
        ['delete', `/v1/admin/shipping-zones/${zone.id}`],
        ['delete', `/v1/admin/shipping-zones/${zone.id}/areas/${area.id}`],
      ];
      for (const [method, url] of routes) {
        const call = () =>
          (
            request(app.getHttpServer()) as unknown as Record<
              string,
              (u: string) => request.Test
            >
          )[method](url);
        await call().send({ flatFee: 1 }).expect(401);
        await call()
          .set('Authorization', customerAuth)
          .send({ flatFee: 1 })
          .expect(403);
      }
      expect(await prisma.shippingZone.count({ where: { id: zone.id } })).toBe(
        1,
      );
      expect(
        await prisma.shippingZoneArea.count({ where: { id: area.id } }),
      ).toBe(1);
      expect(
        (
          await prisma.shippingRate.findUniqueOrThrow({
            where: { id: rate.id },
          })
        ).flatFee.toString(),
      ).toBe('1500');
    });
  });

  describe('rates', () => {
    it('corrects a rate fee and audits before/after', async () => {
      const state = await seedState();
      const { rate } = await seedCoveredZone(state);

      const res = await asAdmin(
        request(app.getHttpServer()).patch(
          `/v1/admin/shipping-rates/${rate.id}`,
        ),
      )
        .send({ flatFee: 2500 })
        .expect(200);

      expect(Number(res.body.flatFee)).toBe(2500);
      const audit = await prisma.auditLog.findFirstOrThrow({
        where: { entityType: 'ShippingRate', entityId: rate.id },
      });
      expect(audit.eventName).toBe('shipping.rate.updated');
      expect(audit.before).toMatchObject({ flatFee: 1500 });
      expect(audit.after).toMatchObject({ flatFee: 2500 });
    });

    it('warns (409) before deleting the last active rate of a covered state, then deletes once acknowledged', async () => {
      const state = await seedState();
      const { rate } = await seedCoveredZone(state);
      const url = `/v1/admin/shipping-rates/${rate.id}`;

      const refused = await asAdmin(
        request(app.getHttpServer()).delete(url),
      ).expect(409);
      expect(refused.body).toMatchObject({
        code: LOST,
        uncoveredStates: [{ code: state }],
      });
      expect(await prisma.shippingRate.count({ where: { id: rate.id } })).toBe(
        1,
      );

      await asAdmin(
        request(app.getHttpServer()).delete(
          `${url}?acknowledgeCoverageLoss=true`,
        ),
      ).expect(204);
      expect(await prisma.shippingRate.count({ where: { id: rate.id } })).toBe(
        0,
      );
      expect(
        await prisma.auditLog.count({
          where: { eventName: 'shipping.rate.deleted', entityId: rate.id },
        }),
      ).toBe(1);
    });

    it('deletes a rate without a warning when another active rate still covers the state', async () => {
      const state = await seedState();
      const { zone, rate } = await seedCoveredZone(state);
      await prisma.shippingRate.create({
        data: {
          zoneId: zone.id,
          currency: CurrencyCode.NGN,
          flatFee: 900,
          priority: 50,
          isActive: true,
        },
      });

      await asAdmin(
        request(app.getHttpServer()).delete(
          `/v1/admin/shipping-rates/${rate.id}`,
        ),
      ).expect(204);
    });

    it('warns (409) when renaming the only STANDARD rate would stop quotes', async () => {
      const state = await seedState();
      const { rate } = await seedCoveredZone(state);

      const refused = await asAdmin(
        request(app.getHttpServer()).patch(
          `/v1/admin/shipping-rates/${rate.id}`,
        ),
      )
        .send({ serviceLevel: 'EXPRESS' })
        .expect(409);
      expect(refused.body.code).toBe(LOST);
      expect(
        (
          await prisma.shippingRate.findUniqueOrThrow({
            where: { id: rate.id },
          })
        ).serviceLevel,
      ).toBe('STANDARD');
    });

    it('waits for the coverage lock, so two guarded changes cannot both pass', async () => {
      const state = await seedState();
      const { rate } = await seedCoveredZone(state);
      let release!: () => void;
      const held = new Promise<void>((resolve) => (release = resolve));
      let locked!: () => void;
      const lockTaken = new Promise<void>((resolve) => (locked = resolve));
      // Another admin's guarded change, stopped just after it took the lock.
      const holder = prisma.$transaction(
        async (tx) => {
          await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('shipping-coverage-guard'))`;
          locked();
          await held;
        },
        { timeout: 20000 },
      );
      await lockTaken;

      let answered = false;
      const deletion = asAdmin(
        request(app.getHttpServer()).delete(
          `/v1/admin/shipping-rates/${rate.id}`,
        ),
      ).then((res) => {
        answered = true;
        return res;
      });
      await new Promise((resolve) => setTimeout(resolve, 700));
      expect(answered).toBe(false);

      release();
      await holder;
      expect((await deletion).status).toBe(409);
    });

    it('answers 404 for an unknown rate', async () => {
      await asAdmin(
        request(app.getHttpServer()).delete(
          '/v1/admin/shipping-rates/does-not-exist',
        ),
      ).expect(404);
    });
  });

  describe('areas', () => {
    it('removes a state from a zone with its rule, after the coverage warning', async () => {
      const state = await seedState();
      const { zone, area, rule } = await seedCoveredZone(state);
      const url = `/v1/admin/shipping-zones/${zone.id}/areas/${area.id}`;

      const refused = await asAdmin(
        request(app.getHttpServer()).delete(url),
      ).expect(409);
      expect(refused.body.code).toBe(LOST);
      expect(
        await prisma.shippingZoneArea.count({ where: { id: area.id } }),
      ).toBe(1);
      expect(
        await prisma.shippingZoneRule.count({ where: { id: rule.id } }),
      ).toBe(1);
      // The refusal rolled everything back, the audit row included.
      expect(
        await prisma.auditLog.count({
          where: { eventName: 'shipping.area.deleted', entityId: area.id },
        }),
      ).toBe(0);

      await asAdmin(
        request(app.getHttpServer()).delete(
          `${url}?acknowledgeCoverageLoss=true`,
        ),
      ).expect(204);
      expect(
        await prisma.shippingZoneArea.count({ where: { id: area.id } }),
      ).toBe(0);
      expect(
        await prisma.shippingZoneRule.count({ where: { id: rule.id } }),
      ).toBe(0);
      expect(
        await prisma.auditLog.count({
          where: { eventName: 'shipping.area.deleted', entityId: area.id },
        }),
      ).toBe(1);
    });

    it('answers 404 when the area belongs to another zone', async () => {
      const a = await seedCoveredZone(await seedState());
      const b = await seedCoveredZone(await seedState());
      await asAdmin(
        request(app.getHttpServer()).delete(
          `/v1/admin/shipping-zones/${a.zone.id}/areas/${b.area.id}`,
        ),
      ).expect(404);
      expect(
        await prisma.shippingZoneArea.count({ where: { id: b.area.id } }),
      ).toBe(1);
    });
  });

  describe('rules and zones', () => {
    it('deletes a rule, warning first when it was the only coverage', async () => {
      const state = await seedState();
      const { rule } = await seedCoveredZone(state);
      const url = `/v1/admin/shipping-rules/${rule.id}`;

      await asAdmin(request(app.getHttpServer()).delete(url)).expect(409);
      await asAdmin(
        request(app.getHttpServer()).delete(
          `${url}?acknowledgeCoverageLoss=true`,
        ),
      ).expect(204);
      expect(
        await prisma.shippingZoneRule.count({ where: { id: rule.id } }),
      ).toBe(0);
    });

    it('refuses to deactivate the only zone of a state without acknowledgement', async () => {
      const state = await seedState();
      const { zone } = await seedCoveredZone(state);
      const url = `/v1/admin/shipping-zones/${zone.id}`;

      await asAdmin(request(app.getHttpServer()).patch(url))
        .send({ isActive: false })
        .expect(409);
      expect(
        (
          await prisma.shippingZone.findUniqueOrThrow({
            where: { id: zone.id },
          })
        ).isActive,
      ).toBe(true);
    });

    it('deletes a zone and cascades its rates, rules and areas, after the warning', async () => {
      const state = await seedState();
      const { zone, rate } = await seedCoveredZone(state);
      const url = `/v1/admin/shipping-zones/${zone.id}`;

      await asAdmin(request(app.getHttpServer()).delete(url)).expect(409);
      await asAdmin(
        request(app.getHttpServer()).delete(
          `${url}?acknowledgeCoverageLoss=true`,
        ),
      ).expect(204);
      expect(await prisma.shippingZone.count({ where: { id: zone.id } })).toBe(
        0,
      );
      expect(await prisma.shippingRate.count({ where: { id: rate.id } })).toBe(
        0,
      );
      expect(
        await prisma.auditLog.count({
          where: { eventName: 'shipping.zone.deleted', entityId: zone.id },
        }),
      ).toBe(1);
    });
  });

  describe('existing orders', () => {
    it('keeps the shipping fee of an existing order when its rate is edited and then deleted', async () => {
      const customer = (await makeUser(UserRole.CUSTOMER, 'buyer')).user;
      const city = `Fix City ${suffix}`;
      const zone = await prisma.shippingZone.create({
        data: { name: `Fix Zone ${city}`, isActive: true },
      });
      zoneIds.push(zone.id);
      await prisma.shippingZoneRule.create({
        data: {
          zoneId: zone.id,
          countryCode: 'NG',
          matchType: ShippingRuleMatchType.CITY,
          matchValue: city,
          priority: 100,
          isActive: true,
        },
      });
      const rate = await prisma.shippingRate.create({
        data: {
          zoneId: zone.id,
          currency: CurrencyCode.NGN,
          flatFee: 1500,
          priority: 100,
          isActive: true,
        },
      });
      const category = await prisma.category.create({
        data: { name: `Fix Cat ${suffix}`, slug: `fix-cat-${suffix}` },
      });
      const product = await prisma.product.create({
        data: {
          name: `Fix Product ${suffix}`,
          slug: `fix-product-${suffix}`,
          status: ProductStatus.ACTIVE,
          categoryId: category.id,
          prices: { create: { currency: CurrencyCode.NGN, amount: 5000 } },
        },
      });
      const variant = await prisma.productVariant.create({
        data: {
          productId: product.id,
          name: 'Default',
          sku: `SKU-FIX-${suffix}`,
        },
      });
      await prisma.inventoryItem.create({
        data: {
          variantId: variant.id,
          stockOnHand: 10,
          reserved: 0,
          trackInventory: true,
          lowStockThreshold: 0,
        },
      });
      const address = await prisma.address.create({
        data: {
          userId: customer.id,
          addressLine1: '1 Fix Street',
          city,
          state: `State ${city}`,
          stateCode: null,
          countryCode: 'NG',
          country: 'Nigeria',
        },
      });
      const order = await orders.create(customer.id, {
        shippingAddressId: address.id,
        items: [{ variantId: variant.id, quantity: 1 }],
      });
      const before = await prisma.order.findUniqueOrThrow({
        where: { id: order.id },
      });

      await asAdmin(
        request(app.getHttpServer()).patch(
          `/v1/admin/shipping-rates/${rate.id}`,
        ),
      )
        .send({ flatFee: 9999 })
        .expect(200);
      await asAdmin(
        request(app.getHttpServer()).delete(
          `/v1/admin/shipping-rates/${rate.id}?acknowledgeCoverageLoss=true`,
        ),
      ).expect(204);

      const after = await prisma.order.findUniqueOrThrow({
        where: { id: order.id },
      });
      expect(after.shippingBreakdown).toEqual(before.shippingBreakdown);
      expect(after.totalAmount.toString()).toBe(before.totalAmount.toString());
      expect(after.shippingFee.toString()).toBe(before.shippingFee.toString());
    });
  });
});
