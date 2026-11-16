import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import type { Response } from 'supertest';
import { App } from 'supertest/types';
import * as bcrypt from 'bcrypt';
import { closeE2eApp, createE2eApp } from './utils/create-e2e-app';
import { PrismaService } from '../src/prisma/prisma.service';
import {
  CurrencyCode,
  ProductStatus,
  ShippingRateProvider,
  ShippingRuleMatchType,
  UserRole,
  UserStatus,
} from '../src/generated/prisma/enums';

const CUSTOMER_ORIGIN = 'http://localhost:3000';
const PASSWORD = 'TestPassword1!';
const LGA_REQUIRED = 'ADDRESS_LGA_REQUIRED';
// States used only by this file: one with an LGA, one without.
const STATE_CODE = 'ZL';
const STATE_NAME = 'Zeta Lga State';
const EMPTY_STATE_CODE = 'ZE';
const EMPTY_STATE_NAME = 'Zeta Empty State';
const LGA_NAME = 'Zeta Lga Area';
const OTHER_LGA = 'Zeta Lga Other';

function cookieValue(res: Response, name: string): string | undefined {
  const setCookie = res.headers['set-cookie'];
  const cookies: string[] = Array.isArray(setCookie)
    ? setCookie
    : setCookie
      ? [setCookie]
      : [];
  for (const raw of cookies) {
    const [pair] = raw.split(';');
    const [key, value] = pair.split('=');
    if (key === name) return decodeURIComponent(value ?? '');
  }
  return undefined;
}

/**
 * TTW-221 (gap 1, owner answer A): a Nigerian address in a state that has
 * active LGAs must name one. Saving refuses it, a saved address without one
 * still loads and can be edited, and quotes and orders ask for an LGA first.
 */
describe('LGA required in a state that has LGAs (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let lgaId: string;

  beforeAll(async () => {
    app = await createE2eApp();
    prisma = app.get(PrismaService);
    for (const [code, name] of [
      [STATE_CODE, STATE_NAME],
      [EMPTY_STATE_CODE, EMPTY_STATE_NAME],
    ]) {
      await prisma.geoState.upsert({
        where: { code },
        update: { isActive: true },
        create: { code, name, isActive: true },
      });
    }
    const lga = await prisma.geoLga.upsert({
      where: { stateCode_name: { stateCode: STATE_CODE, name: LGA_NAME } },
      update: { isActive: true },
      create: { stateCode: STATE_CODE, name: LGA_NAME, isActive: true },
    });
    lgaId = lga.id;
    // A second, always active LGA: the state keeps "having LGAs" while the
    // first one is deactivated in a test.
    await prisma.geoLga.upsert({
      where: { stateCode_name: { stateCode: STATE_CODE, name: OTHER_LGA } },
      update: {},
      create: { stateCode: STATE_CODE, name: OTHER_LGA, isActive: true },
    });
  });

  afterEach(async () => {
    await prisma.geoLga.updateMany({
      where: { stateCode: STATE_CODE },
      data: { isActive: true },
    });
  });

  afterAll(async () => {
    await prisma.address.updateMany({
      where: { stateCode: { in: [STATE_CODE, EMPTY_STATE_CODE] } },
      data: { stateCode: null, lgaId: null },
    });
    await prisma.geoLga.deleteMany({ where: { stateCode: STATE_CODE } });
    await prisma.geoState.deleteMany({
      where: { code: { in: [STATE_CODE, EMPTY_STATE_CODE] } },
    });
    await closeE2eApp(app);
  });

  async function seedCustomerWithVariant(suffix: string) {
    const customer = await prisma.user.create({
      data: {
        email: `spaces-cust-${suffix}@example.com`,
        passwordHash: await bcrypt.hash(PASSWORD, 10),
        role: UserRole.CUSTOMER,
        status: UserStatus.ACTIVE,
        emailVerifiedAt: new Date(),
        firstName: 'Spaces',
        lastName: 'Cust',
      },
    });
    const category = await prisma.category.create({
      data: { name: `Spaces Cat ${suffix}`, slug: `spaces-cat-${suffix}` },
    });
    const product = await prisma.product.create({
      data: {
        name: `Spaces Product ${suffix}`,
        slug: `spaces-product-${suffix}`,
        status: ProductStatus.ACTIVE,
        categoryId: category.id,
        prices: { create: { currency: CurrencyCode.NGN, amount: 5000 } },
      },
    });
    const variant = await prisma.productVariant.create({
      data: {
        productId: product.id,
        name: 'Default',
        sku: `SKU-SPACES-${suffix}`,
      },
    });
    await prisma.inventoryItem.create({
      data: {
        variantId: variant.id,
        stockOnHand: 20,
        reserved: 0,
        trackInventory: true,
        lowStockThreshold: 0,
      },
    });
    return { customer, variant };
  }

  async function seedCityZone(city: string) {
    const zone = await prisma.shippingZone.create({
      data: { name: `Zone ${city}`, isActive: true },
    });
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
    await prisma.shippingRate.create({
      data: {
        zoneId: zone.id,
        provider: ShippingRateProvider.INTERNAL,
        serviceLevel: 'STANDARD',
        currency: CurrencyCode.NGN,
        flatFee: 2000,
        priority: 100,
        isActive: true,
      },
    });
    return zone.id;
  }

  async function loginAgent(email: string) {
    const agent = request.agent(app.getHttpServer());
    const res = await agent
      .post('/v1/auth/login')
      .set('Origin', CUSTOMER_ORIGIN)
      .send({ email, password: PASSWORD })
      .expect(200);
    const csrf =
      (res.body.csrf_token as string) ||
      cookieValue(res, 'ttw_customer_csrf') ||
      '';
    return { agent, csrf };
  }

  it('refuses to save without an LGA, keeps editing an old address, and asks for an LGA before quoting', async () => {
    const suffix = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
    const city = `Lga City ${suffix}`;
    const { customer, variant } = await seedCustomerWithVariant(suffix);
    const zoneId = await seedCityZone(city);
    try {
      const { agent, csrf } = await loginAgent(customer.email);
      const send = (method: 'post' | 'patch', path: string, body: object) =>
        agent[method](path)
          .set('Origin', CUSTOMER_ORIGIN)
          .set('x-csrf-token', csrf)
          .send(body);
      const base = {
        addressLine1: '1 Lga Street',
        city,
        state: STATE_NAME,
        countryCode: 'NG',
      };

      // Create without an LGA, or with a text that names no LGA: refused.
      for (const extra of [{}, { administrativeAreaLevel2: 'Nowhere' }]) {
        const refused = await send('post', '/v1/users/addresses', {
          ...base,
          ...extra,
        }).expect(400);
        expect(refused.body).toMatchObject({ code: LGA_REQUIRED });
      }
      expect(
        await prisma.address.count({ where: { userId: customer.id } }),
      ).toBe(0);

      // A state with no LGA needs none.
      await send('post', '/v1/users/addresses', {
        ...base,
        state: EMPTY_STATE_NAME,
      }).expect(201);

      // A deactivated LGA typed by name is as unknown as a missing one.
      await prisma.geoLga.update({
        where: { id: lgaId },
        data: { isActive: false },
      });
      const typed = await send('post', '/v1/users/addresses', {
        ...base,
        administrativeAreaLevel2: LGA_NAME,
      }).expect(400);
      expect(typed.body).toMatchObject({ code: LGA_REQUIRED });
      await prisma.geoLga.update({
        where: { id: lgaId },
        data: { isActive: true },
      });

      // With an LGA it saves, and the LGA cannot then be cleared.
      const saved = await send('post', '/v1/users/addresses', {
        ...base,
        administrativeAreaLevel2: LGA_NAME,
      }).expect(201);
      const savedId = (saved.body as { id: string }).id;
      expect(saved.body).toMatchObject({ lgaId });
      const cleared = await send('patch', `/v1/users/addresses/${savedId}`, {
        lgaId: null,
      }).expect(400);
      expect(cleared.body).toMatchObject({ code: LGA_REQUIRED });
      expect(
        (await prisma.address.findUniqueOrThrow({ where: { id: savedId } }))
          .lgaId,
      ).toBe(lgaId);

      // An address saved before the rule: loads, edits, but is not quoted.
      const legacy = await prisma.address.create({
        data: {
          userId: customer.id,
          addressLine1: '1 Old Street',
          city,
          state: STATE_NAME,
          stateCode: STATE_CODE,
          countryCode: 'NG',
          country: 'Nigeria',
        },
      });
      const listed = await agent
        .get('/v1/users/addresses')
        .set('Origin', CUSTOMER_ORIGIN)
        .expect(200);
      expect((listed.body as Array<{ id: string }>).map((a) => a.id)).toContain(
        legacy.id,
      );
      await send('patch', `/v1/users/addresses/${legacy.id}`, {
        phone: '+2348012345678',
      }).expect(200);

      const orderBody = {
        shippingAddressId: legacy.id,
        items: [{ variantId: variant.id, quantity: 1 }],
      };
      const before = await prisma.order.count({
        where: { userId: customer.id },
      });
      const quote = await send('post', '/v1/orders/quote', orderBody);
      expect(quote.status).toBe(400);
      expect(quote.body).toMatchObject({ code: LGA_REQUIRED });
      const order = await send('post', '/v1/orders', {
        ...orderBody,
        idempotencyKey: `lga-${suffix}`,
      });
      expect(order.status).toBe(400);
      expect(order.body).toMatchObject({ code: LGA_REQUIRED });
      expect(await prisma.order.count({ where: { userId: customer.id } })).toBe(
        before,
      );

      // Choosing an LGA makes it quotable again.
      await send('patch', `/v1/users/addresses/${legacy.id}`, {
        lgaId,
      }).expect(200);
      await send('post', '/v1/orders/quote', orderBody).expect(200);
    } finally {
      await prisma.shippingZone.update({
        where: { id: zoneId },
        data: { isActive: false },
      });
    }
  });
});
