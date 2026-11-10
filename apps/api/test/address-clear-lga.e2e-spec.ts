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
 * TTW-193: a customer can remove the LGA saved on an address by sending
 * `lgaId: null`. An absent `lgaId` keeps it. After a clear, the LGA-level
 * shipping rule no longer prices the address; the state-level rule does.
 */
describe('Clear the LGA saved on an address (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  const zoneIds: string[] = [];

  beforeAll(async () => {
    app = await createE2eApp();
    prisma = app.get(PrismaService);
  });

  afterAll(async () => {
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

  async function seedZone(
    suffix: string,
    label: string,
    rule: {
      matchType: ShippingRuleMatchType;
      matchValue: string;
      matchContext: string | null;
    },
    fee: number,
    priority: number,
  ) {
    const zone = await prisma.shippingZone.create({
      data: { name: `${label} ${suffix}`, isActive: true },
    });
    zoneIds.push(zone.id);
    await prisma.shippingZoneRule.create({
      data: {
        zoneId: zone.id,
        countryCode: 'NG',
        ...rule,
        priority,
        isActive: true,
      },
    });
    await prisma.shippingRate.create({
      data: {
        zoneId: zone.id,
        provider: ShippingRateProvider.INTERNAL,
        serviceLevel: 'STANDARD',
        currency: CurrencyCode.NGN,
        flatFee: fee,
        priority,
        isActive: true,
      },
    });
  }

  it('removes the LGA on lgaId null, keeps it when absent, and the quote falls back to the state rule', async () => {
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
    // A lower priority number is tried first: the LGA rule wins over the state
    // rule, and both win over the priority-100 rules other test files leave.
    await seedZone(
      suffix,
      'Ikeja LGA',
      {
        matchType: ShippingRuleMatchType.ADMIN2,
        matchValue: ikeja.id,
        matchContext: 'LA',
      },
      3500,
      1,
    );
    await seedZone(
      suffix,
      'Lagos state',
      {
        matchType: ShippingRuleMatchType.ADMIN1,
        matchValue: 'LA',
        matchContext: null,
      },
      2500,
      2,
    );

    const customer = await prisma.user.create({
      data: {
        email: `clear-lga-${suffix}@example.com`,
        passwordHash: await bcrypt.hash(PASSWORD, 10),
        role: UserRole.CUSTOMER,
        status: UserStatus.ACTIVE,
        emailVerifiedAt: new Date(),
        firstName: 'Clear',
        lastName: 'Lga',
      },
    });
    const category = await prisma.category.create({
      data: { name: `Clear Cat ${suffix}`, slug: `clear-cat-${suffix}` },
    });
    const product = await prisma.product.create({
      data: {
        name: `Clear Product ${suffix}`,
        slug: `clear-product-${suffix}`,
        status: ProductStatus.ACTIVE,
        categoryId: category.id,
        prices: { create: { currency: CurrencyCode.NGN, amount: 5000 } },
      },
    });
    const variant = await prisma.productVariant.create({
      data: {
        productId: product.id,
        name: 'Default',
        sku: `SKU-CLEAR-${suffix}`,
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

    const { agent, csrf } = await loginAgent(customer.email);
    const created = await agent
      .post('/v1/users/addresses')
      .set('Origin', CUSTOMER_ORIGIN)
      .set('x-csrf-token', csrf)
      .send({
        addressLine1: '12 Broad Street',
        city: 'Ikeja',
        state: 'Lagos',
        stateCode: 'LA',
        lgaId: ikeja.id,
        country: 'Nigeria',
      })
      .expect(201);
    const addressId = created.body.id as string;
    expect(created.body).toMatchObject({ stateCode: 'LA', lgaId: ikeja.id });

    const quoteFee = async () => {
      const quote = await agent
        .post('/v1/orders/quote')
        .set('Origin', CUSTOMER_ORIGIN)
        .set('x-csrf-token', csrf)
        .send({
          shippingAddressId: addressId,
          items: [{ variantId: variant.id, quantity: 1 }],
        })
        .expect(200);
      return Number(quote.body.shippingFee);
    };
    expect(await quoteFee()).toBe(3500);

    // An edit that does not mention lgaId keeps the LGA.
    const kept = await agent
      .patch(`/v1/users/addresses/${addressId}`)
      .set('Origin', CUSTOMER_ORIGIN)
      .set('x-csrf-token', csrf)
      .send({ city: 'Ikeja GRA', state: 'Lagos', stateCode: 'LA' })
      .expect(200);
    expect(kept.body).toMatchObject({ stateCode: 'LA', lgaId: ikeja.id });

    // lgaId null removes it, and nothing else about the state changes.
    const cleared = await agent
      .patch(`/v1/users/addresses/${addressId}`)
      .set('Origin', CUSTOMER_ORIGIN)
      .set('x-csrf-token', csrf)
      .send({ state: 'Lagos', stateCode: 'LA', lgaId: null })
      .expect(200);
    expect(cleared.body).toMatchObject({
      state: 'Lagos',
      stateCode: 'LA',
      lgaId: null,
      administrativeAreaLevel2: null,
    });
    const saved = await prisma.address.findUniqueOrThrow({
      where: { id: addressId },
    });
    expect(saved).toMatchObject({
      stateCode: 'LA',
      lgaId: null,
      administrativeAreaLevel2: null,
    });

    expect(await quoteFee()).toBe(2500);

    // The cleared address stays cleared on a later edit without lgaId.
    const later = await agent
      .patch(`/v1/users/addresses/${addressId}`)
      .set('Origin', CUSTOMER_ORIGIN)
      .set('x-csrf-token', csrf)
      .send({ phone: '+2348012345678' })
      .expect(200);
    expect(later.body).toMatchObject({ lgaId: null });
  });
});
