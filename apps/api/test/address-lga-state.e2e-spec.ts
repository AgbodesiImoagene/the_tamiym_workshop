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
 * TTW-186: an LGA id sent for an address whose state is unknown must not be
 * stored, or an ADMIN2 rule with no `matchContext` prices the address at that
 * LGA's rate. The edit goes through the real PATCH route; the address is
 * inserted directly because creating a Nigerian address with an unknown state
 * is refused since TTW-087 (older addresses may still have no state code).
 */
describe('Address LGA that contradicts the state (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  const zoneIds: string[] = [];

  beforeAll(async () => {
    app = await createE2eApp();
    prisma = app.get(PrismaService);
  });

  afterAll(async () => {
    // The ADMIN2 rule has no state context, so it must not outlive this file.
    await prisma.shippingZone.deleteMany({ where: { id: { in: zoneIds } } });
    await closeE2eApp(app);
  });

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

  it('does not store an lgaId on an address with an unknown state, so the quote is refused', async () => {
    const suffix = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
    await prisma.geoState.upsert({
      where: { code: 'LA' },
      update: { isActive: true },
      create: { code: 'LA', name: 'Lagos', isActive: true },
    });
    const ikeja = await prisma.geoLga.upsert({
      where: { stateCode_name: { stateCode: 'LA', name: 'Ikeja' } },
      update: { isActive: true },
      create: { stateCode: 'LA', name: 'Ikeja', isActive: true },
    });
    const zone = await prisma.shippingZone.create({
      data: { name: `Ikeja LGA ${suffix}`, isActive: true },
    });
    zoneIds.push(zone.id);
    await prisma.shippingZoneRule.create({
      data: {
        zoneId: zone.id,
        countryCode: 'NG',
        matchType: ShippingRuleMatchType.ADMIN2,
        matchValue: ikeja.id,
        matchContext: null,
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

    const customer = await prisma.user.create({
      data: {
        email: `lga-state-${suffix}@example.com`,
        passwordHash: await bcrypt.hash(PASSWORD, 10),
        role: UserRole.CUSTOMER,
        status: UserStatus.ACTIVE,
        emailVerifiedAt: new Date(),
        firstName: 'Lga',
        lastName: 'State',
      },
    });
    const category = await prisma.category.create({
      data: { name: `Lga Cat ${suffix}`, slug: `lga-cat-${suffix}` },
    });
    const product = await prisma.product.create({
      data: {
        name: `Lga Product ${suffix}`,
        slug: `lga-product-${suffix}`,
        status: ProductStatus.ACTIVE,
        categoryId: category.id,
        prices: { create: { currency: CurrencyCode.NGN, amount: 5000 } },
      },
    });
    const variant = await prisma.productVariant.create({
      data: {
        productId: product.id,
        name: 'Default',
        sku: `SKU-LGA-${suffix}`,
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

    // An address saved before TTW-087: a state we do not know, no codes.
    const legacy = await prisma.address.create({
      data: {
        userId: customer.id,
        addressLine1: '1 Old Road',
        city: `Nowhere ${suffix}`,
        state: `Atlantis ${suffix}`,
        administrativeAreaLevel1: `Atlantis ${suffix}`,
        country: 'Nigeria',
        countryCode: 'NG',
        stateCode: null,
        lgaId: null,
      },
    });

    const { agent, csrf } = await loginAgent(customer.email);
    const patched = await agent
      .patch(`/v1/users/addresses/${legacy.id}`)
      .set('Origin', CUSTOMER_ORIGIN)
      .set('x-csrf-token', csrf)
      .send({ lgaId: ikeja.id })
      .expect(200);
    expect(patched.body).toMatchObject({ stateCode: null, lgaId: null });

    const saved = await prisma.address.findUniqueOrThrow({
      where: { id: legacy.id },
    });
    expect(saved).toMatchObject({ stateCode: null, lgaId: null });

    const quote = await agent
      .post('/v1/orders/quote')
      .set('Origin', CUSTOMER_ORIGIN)
      .set('x-csrf-token', csrf)
      .send({
        shippingAddressId: legacy.id,
        items: [{ variantId: variant.id, quantity: 1 }],
      });
    expect(quote.status).toBe(400);
    expect(quote.body).toMatchObject({ code: 'SHIPPING_ADDRESS_NOT_COVERED' });
    expect(quote.body).not.toHaveProperty('shippingFee');
  });
});
