import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import type { Response } from 'supertest';
import { App } from 'supertest/types';
import * as bcrypt from 'bcrypt';
import { closeE2eApp, createE2eApp } from './utils/create-e2e-app';
import { PrismaService } from '../src/prisma/prisma.service';
import { OrdersService } from '../src/orders/orders.service';
import {
  CampaignStatus,
  CurrencyCode,
  ModerationStatus,
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
 * TTW-086: an address that matches no shipping zone (or a zone without an
 * active rate) is refused with a stable code instead of being quoted at ₦0.
 * Nothing is written on refusal, so a retry after correcting the address
 * still works with the same idempotency key (TTW-037). An explicit ₦0 rate
 * set by an admin stays valid.
 *
 * Every zone here matches a CITY that is unique to the test, so rules left
 * by other suites in the same database cannot cover or shadow these
 * addresses.
 */
describe('Shipping zone coverage (e2e)', () => {
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

  async function seedCustomerWithVariant(suffix: string) {
    const customer = await prisma.user.create({
      data: {
        email: `zone-cust-${suffix}@example.com`,
        passwordHash: await bcrypt.hash(PASSWORD, 10),
        role: UserRole.CUSTOMER,
        status: UserStatus.ACTIVE,
        emailVerifiedAt: new Date(),
        firstName: 'Zone',
        lastName: 'Cust',
      },
    });
    const category = await prisma.category.create({
      data: { name: `Zone Cat ${suffix}`, slug: `zone-cat-${suffix}` },
    });
    const product = await prisma.product.create({
      data: {
        name: `Zone Product ${suffix}`,
        slug: `zone-product-${suffix}`,
        status: ProductStatus.ACTIVE,
        categoryId: category.id,
        prices: { create: { currency: CurrencyCode.NGN, amount: 5000 } },
      },
    });
    const variant = await prisma.productVariant.create({
      data: {
        productId: product.id,
        name: 'Default',
        sku: `SKU-ZONE-${suffix}`,
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
    return { customer, product, variant };
  }

  /** A zone matching one unique city, with an optional active rate. */
  async function seedCityZone(city: string, flatFee: number | null) {
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
    if (flatFee !== null) {
      await prisma.shippingRate.create({
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
    }
    return zone;
  }

  function createAddress(userId: string, city: string) {
    return prisma.address.create({
      data: {
        userId,
        addressLine1: '1 Coverage Street',
        city,
        state: `State ${city}`,
        stateCode: null,
        countryCode: 'NG',
        country: 'Nigeria',
      },
    });
  }

  async function seedActiveCampaign(suffix: string, productId: string) {
    const organizer = await prisma.user.create({
      data: {
        email: `zone-org-${suffix}@example.com`,
        passwordHash: await bcrypt.hash(PASSWORD, 10),
        role: UserRole.ORGANIZER,
        status: UserStatus.ACTIVE,
        emailVerifiedAt: new Date(),
        firstName: 'Zone',
        lastName: 'Org',
      },
    });
    return prisma.campaign.create({
      data: {
        organizerId: organizer.id,
        title: `Zone Campaign ${suffix}`,
        slug: `zone-campaign-${suffix}`,
        status: CampaignStatus.ACTIVE,
        moderationStatus: ModerationStatus.APPROVED,
        endDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        products: {
          create: {
            productId,
            prices: { create: { currency: CurrencyCode.NGN, amount: 8000 } },
          },
        },
      },
    });
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

  async function expectNotCovered(promise: Promise<unknown>) {
    const error: unknown = await promise.then(
      () => undefined,
      (e: unknown) => e,
    );
    expect(error).toBeDefined();
    expect(
      (error as { getResponse?: () => unknown }).getResponse?.(),
    ).toMatchObject({ code: NOT_COVERED });
  }

  async function writesFor(userId: string, variantId: string) {
    const [orderRows, inventory] = await Promise.all([
      prisma.order.count({ where: { userId } }),
      prisma.inventoryItem.findUniqueOrThrow({ where: { variantId } }),
    ]);
    return { orderRows, reserved: inventory.reserved };
  }

  it('answers 400 SHIPPING_ADDRESS_NOT_COVERED on both quote routes for an uncovered address', async () => {
    const suffix = `http-${Date.now()}`;
    const { customer, product, variant } =
      await seedCustomerWithVariant(suffix);
    const campaign = await seedActiveCampaign(suffix, product.id);
    const address = await createAddress(customer.id, `Uncovered ${suffix}`);
    const { agent, csrf } = await loginAgent(customer.email);
    const body = {
      shippingAddressId: address.id,
      items: [{ variantId: variant.id, quantity: 1 }],
    };

    const standard = await agent
      .post('/v1/orders/quote')
      .set('Origin', CUSTOMER_ORIGIN)
      .set('x-csrf-token', csrf)
      .send(body);
    const fundraiser = await agent
      .post(`/v1/campaigns/${campaign.id}/orders/quote`)
      .set('Origin', CUSTOMER_ORIGIN)
      .set('x-csrf-token', csrf)
      .send(body);

    for (const res of [standard, fundraiser]) {
      expect(res.status).toBe(400);
      expect(res.body).toMatchObject({
        code: NOT_COVERED,
        message: expect.stringContaining("We don't deliver to this address"),
      });
      expect(res.body).not.toHaveProperty('shippingFee');
    }
  });

  it('refuses a zone that has no active rate instead of charging ₦0', async () => {
    const suffix = `norate-${Date.now()}`;
    const { customer, variant } = await seedCustomerWithVariant(suffix);
    const city = `No Rate ${suffix}`;
    await seedCityZone(city, null);
    const address = await createAddress(customer.id, city);

    await expectNotCovered(
      orders.create(customer.id, {
        shippingAddressId: address.id,
        items: [{ variantId: variant.id, quantity: 1 }],
      }),
    );
    expect(await writesFor(customer.id, variant.id)).toEqual({
      orderRows: 0,
      reserved: 0,
    });
  });

  it('writes no standard order and reserves no stock, then accepts the same key once the address is corrected', async () => {
    const suffix = `std-${Date.now()}`;
    const { customer, variant } = await seedCustomerWithVariant(suffix);
    const coveredCity = `Covered ${suffix}`;
    await seedCityZone(coveredCity, 2000);
    const address = await createAddress(customer.id, `Uncovered ${suffix}`);
    const dto = {
      shippingAddressId: address.id,
      items: [{ variantId: variant.id, quantity: 2 }],
      idempotencyKey: `key-${suffix}`,
    };

    await expectNotCovered(orders.create(customer.id, dto));
    expect(await writesFor(customer.id, variant.id)).toEqual({
      orderRows: 0,
      reserved: 0,
    });

    await prisma.address.update({
      where: { id: address.id },
      data: { city: coveredCity },
    });
    const order = await orders.create(customer.id, dto);

    expect(Number(order.shippingFee)).toBe(2000);
    expect(await writesFor(customer.id, variant.id)).toEqual({
      orderRows: 1,
      reserved: 2,
    });
  });

  it('writes no campaign order and reserves no stock for an uncovered address', async () => {
    const suffix = `camp-${Date.now()}`;
    const { customer, product, variant } =
      await seedCustomerWithVariant(suffix);
    const campaign = await seedActiveCampaign(suffix, product.id);
    const address = await createAddress(customer.id, `Uncovered ${suffix}`);

    await expectNotCovered(
      orders.createCampaignOrder(campaign.id, customer.id, {
        shippingAddressId: address.id,
        items: [{ variantId: variant.id, quantity: 1 }],
        idempotencyKey: `key-${suffix}`,
      }),
    );
    expect(await writesFor(customer.id, variant.id)).toEqual({
      orderRows: 0,
      reserved: 0,
    });
  });

  it('keeps an explicit ₦0 rate set by an admin', async () => {
    const suffix = `free-${Date.now()}`;
    const { customer, variant } = await seedCustomerWithVariant(suffix);
    const city = `Free Delivery ${suffix}`;
    await seedCityZone(city, 0);
    const address = await createAddress(customer.id, city);

    const order = await orders.create(customer.id, {
      shippingAddressId: address.id,
      items: [{ variantId: variant.id, quantity: 1 }],
    });

    expect(Number(order.shippingFee)).toBe(0);
    expect(await writesFor(customer.id, variant.id)).toMatchObject({
      orderRows: 1,
    });
  });
});
