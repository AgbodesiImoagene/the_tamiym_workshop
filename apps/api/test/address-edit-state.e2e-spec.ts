import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import type { Response } from 'supertest';
import { App } from 'supertest/types';
import * as bcrypt from 'bcrypt';
import { closeE2eApp, createE2eApp } from './utils/create-e2e-app';
import { PrismaService } from '../src/prisma/prisma.service';
import { OrdersService } from '../src/orders/orders.service';
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
const NOT_COVERED = 'SHIPPING_ADDRESS_NOT_COVERED';

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
 * TTW-185: a saved Lagos address edited to a state the platform does not
 * recognise must lose its old state code and LGA, so it is refused with
 * SHIPPING_ADDRESS_NOT_COVERED (TTW-086) instead of being priced at the
 * Lagos rate. The edit goes through the real PATCH route, as the checkout
 * and settings forms send it (free-text `state`, no `stateCode`).
 */
describe('Address edit to an unknown state (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let orders: OrdersService;

  beforeAll(async () => {
    app = await createE2eApp();
    prisma = app.get(PrismaService);
    orders = app.get(OrdersService);
  });

  afterAll(async () => {
    await closeE2eApp(app);
  });

  async function seedLagosCoverage(suffix: string) {
    // Same reference rows as prisma/seed.ts and seed:e2e (idempotent).
    await prisma.geoState.upsert({
      where: { code: 'LA' },
      update: { isActive: true },
      create: { code: 'LA', name: 'Lagos', isActive: true },
    });
    await prisma.geoLga.upsert({
      where: { stateCode_name: { stateCode: 'LA', name: 'Ikeja' } },
      update: { isActive: true },
      create: { stateCode: 'LA', name: 'Ikeja', isActive: true },
    });
    const zone = await prisma.shippingZone.create({
      data: { name: `Lagos edit ${suffix}`, isActive: true },
    });
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
      },
    });
  }

  async function seedCustomerWithVariant(suffix: string) {
    const customer = await prisma.user.create({
      data: {
        email: `edit-state-${suffix}@example.com`,
        passwordHash: await bcrypt.hash(PASSWORD, 10),
        role: UserRole.CUSTOMER,
        status: UserStatus.ACTIVE,
        emailVerifiedAt: new Date(),
        firstName: 'Edit',
        lastName: 'State',
      },
    });
    const category = await prisma.category.create({
      data: { name: `Edit Cat ${suffix}`, slug: `edit-cat-${suffix}` },
    });
    const product = await prisma.product.create({
      data: {
        name: `Edit Product ${suffix}`,
        slug: `edit-product-${suffix}`,
        status: ProductStatus.ACTIVE,
        categoryId: category.id,
        prices: { create: { currency: CurrencyCode.NGN, amount: 5000 } },
      },
    });
    const variant = await prisma.productVariant.create({
      data: {
        productId: product.id,
        name: 'Default',
        sku: `SKU-EDIT-${suffix}`,
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
    return { customer, variant };
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

  it('refuses the quote and the order once a Lagos address is edited to an unknown state', async () => {
    const suffix = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
    await seedLagosCoverage(suffix);
    const { customer, variant } = await seedCustomerWithVariant(suffix);
    const { agent, csrf } = await loginAgent(customer.email);
    const city = `Edit City ${suffix}`;

    const created = await agent
      .post('/v1/users/addresses')
      .set('Origin', CUSTOMER_ORIGIN)
      .set('x-csrf-token', csrf)
      .send({
        addressLine1: '12 Broad Street',
        city,
        state: 'Lagos',
        administrativeAreaLevel2: 'Ikeja',
        country: 'Nigeria',
      })
      .expect(201);
    const addressId = created.body.id as string;
    expect(created.body).toMatchObject({ stateCode: 'LA' });
    expect(created.body.lgaId).toEqual(expect.any(String));

    const quoteBody = {
      shippingAddressId: addressId,
      items: [{ variantId: variant.id, quantity: 1 }],
    };
    const lagosQuote = await agent
      .post('/v1/orders/quote')
      .set('Origin', CUSTOMER_ORIGIN)
      .set('x-csrf-token', csrf)
      .send(quoteBody);
    expect([200, 201]).toContain(lagosQuote.status);
    expect(Number(lagosQuote.body.shippingFee)).toBeGreaterThan(0);

    const unknownState = `Atlantis ${suffix}`;
    const edited = await agent
      .patch(`/v1/users/addresses/${addressId}`)
      .set('Origin', CUSTOMER_ORIGIN)
      .set('x-csrf-token', csrf)
      .send({
        addressLine1: '12 Broad Street',
        city,
        state: unknownState,
        country: 'Nigeria',
      })
      .expect(200);

    const refusedQuote = await agent
      .post('/v1/orders/quote')
      .set('Origin', CUSTOMER_ORIGIN)
      .set('x-csrf-token', csrf)
      .send(quoteBody);
    expect({
      status: refusedQuote.status,
      code: refusedQuote.body.code,
      shippingFee: refusedQuote.body.shippingFee,
    }).toEqual({ status: 400, code: NOT_COVERED, shippingFee: undefined });

    expect(edited.body).toMatchObject({
      state: unknownState,
      stateCode: null,
      lgaId: null,
      administrativeAreaLevel2: null,
    });

    const orderError: unknown = await orders
      .create(customer.id, { ...quoteBody, idempotencyKey: `key-${suffix}` })
      .then(
        () => undefined,
        (e: unknown) => e,
      );
    expect(
      (orderError as { getResponse?: () => unknown })?.getResponse?.(),
    ).toMatchObject({ code: NOT_COVERED });
    const [orderRows, inventory] = await Promise.all([
      prisma.order.count({ where: { userId: customer.id } }),
      prisma.inventoryItem.findUniqueOrThrow({
        where: { variantId: variant.id },
      }),
    ]);
    expect({ orderRows, reserved: inventory.reserved }).toEqual({
      orderRows: 0,
      reserved: 0,
    });
  });

  it('keeps the Lagos rate when the checkout resends the same address with a new phone', async () => {
    const suffix = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
    await seedLagosCoverage(suffix);
    const { customer, variant } = await seedCustomerWithVariant(suffix);
    const { agent, csrf } = await loginAgent(customer.email);
    const city = `Edit City ${suffix}`;
    const address = {
      addressLine1: '12 Broad Street',
      city,
      state: 'Lagos',
      country: 'Nigeria',
    };

    const created = await agent
      .post('/v1/users/addresses')
      .set('Origin', CUSTOMER_ORIGIN)
      .set('x-csrf-token', csrf)
      .send({ ...address, administrativeAreaLevel2: 'Ikeja' })
      .expect(201);
    const addressId = created.body.id as string;

    const edited = await agent
      .patch(`/v1/users/addresses/${addressId}`)
      .set('Origin', CUSTOMER_ORIGIN)
      .set('x-csrf-token', csrf)
      .send({ ...address, phone: '+2348012345678' })
      .expect(200);
    expect(edited.body).toMatchObject({
      stateCode: 'LA',
      lgaId: created.body.lgaId,
    });

    const quote = await agent
      .post('/v1/orders/quote')
      .set('Origin', CUSTOMER_ORIGIN)
      .set('x-csrf-token', csrf)
      .send({
        shippingAddressId: addressId,
        items: [{ variantId: variant.id, quantity: 1 }],
      });
    expect([200, 201]).toContain(quote.status);
    expect(Number(quote.body.shippingFee)).toBeGreaterThan(0);
  });
});
