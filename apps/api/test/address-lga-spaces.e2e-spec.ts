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
const NOT_DELIVERABLE = 'ADDRESS_STATE_NOT_DELIVERABLE';
// A state used only by this file, so deactivating its LGA never disturbs the
// shared reference rows other e2e files rely on.
const STATE_CODE = 'ZS';
const STATE_NAME = 'Zeta Spaces State';
const LGA_NAME = 'Zeta Spaces LGA';

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
 * TTW-221 (gap 2): an LGA typed with extra or unusual spaces must resolve to
 * the same LGA the shipping resolver sees, so a later deactivation of that LGA
 * still refuses quotes and orders for the address.
 */
describe('LGA typed with unusual spaces (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let lgaId: string;

  beforeAll(async () => {
    app = await createE2eApp();
    prisma = app.get(PrismaService);
    await prisma.geoState.upsert({
      where: { code: STATE_CODE },
      update: { isActive: true },
      create: { code: STATE_CODE, name: STATE_NAME, isActive: true },
    });
    const lga = await prisma.geoLga.upsert({
      where: { stateCode_name: { stateCode: STATE_CODE, name: LGA_NAME } },
      update: { isActive: true },
      create: { stateCode: STATE_CODE, name: LGA_NAME, isActive: true },
    });
    lgaId = lga.id;
  });

  afterEach(async () => {
    await prisma.geoLga.updateMany({
      where: { stateCode: STATE_CODE },
      data: { isActive: true },
    });
  });

  afterAll(async () => {
    await prisma.address.updateMany({
      where: { stateCode: STATE_CODE },
      data: { stateCode: null, lgaId: null },
    });
    await prisma.geoLga.deleteMany({ where: { stateCode: STATE_CODE } });
    await prisma.geoState.deleteMany({ where: { code: STATE_CODE } });
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

  // The rule names the LGA by text, as the resolver's name-to-name match does.
  async function seedAdmin2Zone(suffix: string) {
    const zone = await prisma.shippingZone.create({
      data: { name: `Zone spaces ${suffix}`, isActive: true },
    });
    await prisma.shippingZoneRule.create({
      data: {
        zoneId: zone.id,
        countryCode: 'NG',
        matchType: ShippingRuleMatchType.ADMIN2,
        matchValue: LGA_NAME,
        matchContext: STATE_CODE,
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

  it.each([
    ['a double space', 'Zeta  Spaces LGA'],
    ['a tab', 'Zeta\tSpaces LGA'],
    ['a non-breaking space', 'Zeta\u00a0Spaces LGA'],
    ['spaces around the name', '  zeta spaces   lga  '],
  ])(
    'links the LGA typed with %s, and a deactivated LGA is then refused',
    async (_label, typed) => {
      const suffix = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
      const { customer, variant } = await seedCustomerWithVariant(suffix);
      const zoneId = await seedAdmin2Zone(suffix);
      try {
        const { agent, csrf } = await loginAgent(customer.email);
        const created = await agent
          .post('/v1/users/addresses')
          .set('Origin', CUSTOMER_ORIGIN)
          .set('x-csrf-token', csrf)
          .send({
            addressLine1: '1 Spaces Street',
            city: 'Spaces Town',
            state: STATE_NAME,
            countryCode: 'NG',
            administrativeAreaLevel2: typed,
          })
          .expect(201);
        const addressId = (created.body as { id: string }).id;
        const row = await prisma.address.findUniqueOrThrow({
          where: { id: addressId },
        });
        expect(row.lgaId).toBe(lgaId);
        expect(row.administrativeAreaLevel2).toBe(LGA_NAME);

        const quote = () =>
          agent
            .post('/v1/orders/quote')
            .set('Origin', CUSTOMER_ORIGIN)
            .set('x-csrf-token', csrf)
            .send({
              shippingAddressId: addressId,
              items: [{ variantId: variant.id, quantity: 1 }],
            });

        // Active LGA: the address is priced through the ADMIN2 rule.
        await quote().expect(200);

        await prisma.geoLga.update({
          where: { id: lgaId },
          data: { isActive: false },
        });
        const refused = await quote();
        expect(refused.status).toBe(400);
        expect(refused.body).toMatchObject({ code: NOT_DELIVERABLE });
      } finally {
        await prisma.shippingZone.update({
          where: { id: zoneId },
          data: { isActive: false },
        });
      }
    },
  );
});
