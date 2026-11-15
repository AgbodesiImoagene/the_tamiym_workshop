import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import type { Response } from 'supertest';
import { App } from 'supertest/types';
import * as bcrypt from 'bcrypt';
import { closeE2eApp, createE2eApp } from './utils/create-e2e-app';
import { PrismaService } from '../src/prisma/prisma.service';
import { OrdersService } from '../src/orders/orders.service';
import { PaymentsService } from '../src/orders/payments.service';
import { PaystackTransactionClient } from '../src/orders/paystack-transaction.client';
import { PaystackWebhookService } from '../src/orders/paystack-webhook.service';
import {
  CampaignStatus,
  CurrencyCode,
  ModerationStatus,
  OrderStatus,
  PaymentStatus,
  ProductStatus,
  ShippingRateProvider,
  ShippingRuleMatchType,
  UserRole,
  UserStatus,
} from '../src/generated/prisma/enums';

const CUSTOMER_ORIGIN = 'http://localhost:3000';
const PASSWORD = 'TestPassword1!';
const NOT_DELIVERABLE = 'ADDRESS_STATE_NOT_DELIVERABLE';
const MESSAGE = 'We do not deliver to this area.';
// A state used only by this file, so deactivating it never disturbs the
// shared reference rows (Lagos, ...) other e2e files rely on.
const STATE_CODE = 'ZR';
const STATE_NAME = 'Zeta Refuse State';
const LGA_NAME = 'Zeta Refuse LGA';

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
 * TTW-217: an address saved before its state or LGA was deactivated still loads, but
 * it is no longer quoted or ordered ("We do not deliver to this area.").
 * The refusal runs before any write. Orders that already exist keep their
 * path: replay by key, payment initiation and settlement.
 *
 * The zone matches a CITY unique to each test, so rules left by other suites
 * cannot cover or shadow these addresses; the state is only what the refusal
 * looks at.
 */
describe('Address in a state we no longer deliver to (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let orders: OrdersService;
  let payments: PaymentsService;
  let webhooks: PaystackWebhookService;

  beforeAll(async () => {
    app = await createE2eApp();
    prisma = app.get(PrismaService);
    orders = app.get(OrdersService);
    payments = app.get(PaymentsService);
    webhooks = app.get(PaystackWebhookService);
    await prisma.geoState.upsert({
      where: { code: STATE_CODE },
      update: { isActive: true },
      create: { code: STATE_CODE, name: STATE_NAME, isActive: true },
    });
  });

  // A failed assertion must not leave the state or LGA inactive for the next test.
  afterEach(async () => {
    await prisma.geoState.update({
      where: { code: STATE_CODE },
      data: { isActive: true },
    });
    await prisma.geoLga.updateMany({
      where: { stateCode: STATE_CODE },
      data: { isActive: true },
    });
  });

  afterAll(async () => {
    // Leave the shared reference data as it was found. Orders keep their own
    // snapshot, so the address rows can go while the orders stay.
    await prisma.address.updateMany({
      where: { stateCode: STATE_CODE },
      data: { stateCode: null, lgaId: null },
    });
    await prisma.geoLga.deleteMany({ where: { stateCode: STATE_CODE } });
    await prisma.geoState.deleteMany({ where: { code: STATE_CODE } });
    await closeE2eApp(app);
  });

  function setStateActive(isActive: boolean) {
    return prisma.geoState.update({
      where: { code: STATE_CODE },
      data: { isActive },
    });
  }

  async function seedCustomerWithVariant(suffix: string) {
    const customer = await prisma.user.create({
      data: {
        email: `refuse-cust-${suffix}@example.com`,
        passwordHash: await bcrypt.hash(PASSWORD, 10),
        role: UserRole.CUSTOMER,
        status: UserStatus.ACTIVE,
        emailVerifiedAt: new Date(),
        firstName: 'Refuse',
        lastName: 'Cust',
      },
    });
    const category = await prisma.category.create({
      data: { name: `Refuse Cat ${suffix}`, slug: `refuse-cat-${suffix}` },
    });
    const product = await prisma.product.create({
      data: {
        name: `Refuse Product ${suffix}`,
        slug: `refuse-product-${suffix}`,
        status: ProductStatus.ACTIVE,
        categoryId: category.id,
        prices: { create: { currency: CurrencyCode.NGN, amount: 5000 } },
      },
    });
    const variant = await prisma.productVariant.create({
      data: {
        productId: product.id,
        name: 'Default',
        sku: `SKU-REFUSE-${suffix}`,
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
    return { customer, product, variant };
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
  }

  function createAddress(userId: string, city: string, stateCode: string) {
    return prisma.address.create({
      data: {
        userId,
        addressLine1: '1 Refusal Street',
        city,
        state: STATE_NAME,
        stateCode,
        countryCode: 'NG',
        country: 'Nigeria',
      },
    });
  }

  async function seedActiveCampaign(suffix: string, productId: string) {
    const organizer = await prisma.user.create({
      data: {
        email: `refuse-org-${suffix}@example.com`,
        passwordHash: await bcrypt.hash(PASSWORD, 10),
        role: UserRole.ORGANIZER,
        status: UserStatus.ACTIVE,
        emailVerifiedAt: new Date(),
        firstName: 'Refuse',
        lastName: 'Org',
      },
    });
    return prisma.campaign.create({
      data: {
        organizerId: organizer.id,
        title: `Refuse Campaign ${suffix}`,
        slug: `refuse-campaign-${suffix}`,
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

  async function expectNotDeliverable(promise: Promise<unknown>) {
    const error: unknown = await promise.then(
      () => undefined,
      (e: unknown) => e,
    );
    expect(error).toBeDefined();
    expect(
      (error as { getResponse?: () => unknown }).getResponse?.(),
    ).toMatchObject({ code: NOT_DELIVERABLE, message: MESSAGE });
  }

  async function writesFor(userId: string, variantId: string) {
    const [orderRows, paymentRows, inventory] = await Promise.all([
      prisma.order.count({ where: { userId } }),
      prisma.payment.count({ where: { order: { userId } } }),
      prisma.inventoryItem.findUniqueOrThrow({ where: { variantId } }),
    ]);
    return { orderRows, paymentRows, reserved: inventory.reserved };
  }

  it('answers 400 ADDRESS_STATE_NOT_DELIVERABLE on all four routes, writes nothing, and quotes again once the state is active', async () => {
    const suffix = `http-${Date.now()}`;
    const city = `Refuse City ${suffix}`;
    const { customer, product, variant } =
      await seedCustomerWithVariant(suffix);
    const campaign = await seedActiveCampaign(suffix, product.id);
    await seedCityZone(city);
    const address = await createAddress(customer.id, city, STATE_CODE);
    const { agent, csrf } = await loginAgent(customer.email);
    const body = {
      shippingAddressId: address.id,
      items: [{ variantId: variant.id, quantity: 1 }],
    };
    const post = (path: string, payload: Record<string, unknown>) =>
      agent
        .post(path)
        .set('Origin', CUSTOMER_ORIGIN)
        .set('x-csrf-token', csrf)
        .send(payload);

    // Active state: the address is priced.
    await post('/v1/orders/quote', body).expect(200);

    await setStateActive(false);
    const before = await writesFor(customer.id, variant.id);

    const responses = [
      await post('/v1/orders/quote', body),
      await post(`/v1/campaigns/${campaign.id}/orders/quote`, body),
      await post('/v1/orders', { ...body, idempotencyKey: `std-${suffix}` }),
      await post(`/v1/campaigns/${campaign.id}/orders`, {
        ...body,
        idempotencyKey: `camp-${suffix}`,
      }),
    ];
    for (const res of responses) {
      expect(res.status).toBe(400);
      expect(res.body).toMatchObject({
        code: NOT_DELIVERABLE,
        message: MESSAGE,
      });
      expect(res.body).not.toHaveProperty('shippingFee');
    }
    expect(await writesFor(customer.id, variant.id)).toEqual(before);

    // The address still loads: only quoting and ordering are refused.
    const listed = await agent
      .get('/v1/users/addresses')
      .set('Origin', CUSTOMER_ORIGIN)
      .expect(200);
    expect((listed.body as Array<{ id: string }>).map((a) => a.id)).toContain(
      address.id,
    );

    // The refusal follows the state: reactivating it prices the address again.
    await setStateActive(true);
    await post('/v1/orders/quote', body).expect(200);
  });

  it('keeps answering 403 for another user’s address in a deactivated state', async () => {
    const suffix = `own-${Date.now()}`;
    const city = `Refuse City ${suffix}`;
    const owner = await seedCustomerWithVariant(`${suffix}-a`);
    const other = await seedCustomerWithVariant(`${suffix}-b`);
    const address = await createAddress(owner.customer.id, city, STATE_CODE);
    await setStateActive(false);
    try {
      const { agent, csrf } = await loginAgent(other.customer.email);
      const res = await agent
        .post('/v1/orders/quote')
        .set('Origin', CUSTOMER_ORIGIN)
        .set('x-csrf-token', csrf)
        .send({
          shippingAddressId: address.id,
          items: [{ variantId: other.variant.id, quantity: 1 }],
        });
      expect(res.status).toBe(403);
      expect(res.body).not.toMatchObject({ code: NOT_DELIVERABLE });
    } finally {
      await setStateActive(true);
    }
  });

  it('writes no standard order, reserves no stock and creates no payment for a refused order', async () => {
    const suffix = `std-${Date.now()}`;
    const city = `Refuse City ${suffix}`;
    const { customer, variant } = await seedCustomerWithVariant(suffix);
    await seedCityZone(city);
    const address = await createAddress(customer.id, city, STATE_CODE);
    await setStateActive(false);
    try {
      await expectNotDeliverable(
        orders.create(customer.id, {
          shippingAddressId: address.id,
          items: [{ variantId: variant.id, quantity: 2 }],
          idempotencyKey: `key-${suffix}`,
        }),
      );
      expect(await writesFor(customer.id, variant.id)).toEqual({
        orderRows: 0,
        paymentRows: 0,
        reserved: 0,
      });
    } finally {
      await setStateActive(true);
    }
  });

  it('writes no campaign order and reserves no stock for a refused campaign order', async () => {
    const suffix = `camp-${Date.now()}`;
    const city = `Refuse City ${suffix}`;
    const { customer, product, variant } =
      await seedCustomerWithVariant(suffix);
    const campaign = await seedActiveCampaign(suffix, product.id);
    await seedCityZone(city);
    const address = await createAddress(customer.id, city, STATE_CODE);
    await setStateActive(false);
    try {
      await expectNotDeliverable(
        orders.createCampaignOrder(campaign.id, customer.id, {
          shippingAddressId: address.id,
          items: [{ variantId: variant.id, quantity: 1 }],
          idempotencyKey: `key-${suffix}`,
        }),
      );
      expect(await writesFor(customer.id, variant.id)).toEqual({
        orderRows: 0,
        paymentRows: 0,
        reserved: 0,
      });
    } finally {
      await setStateActive(true);
    }
  });

  it('refuses all four routes for an address whose LGA was deactivated, writes nothing, and prices it again once the LGA is active', async () => {
    const suffix = `lga-${Date.now()}`;
    const city = `Refuse City ${suffix}`;
    const { customer, product, variant } =
      await seedCustomerWithVariant(suffix);
    const campaign = await seedActiveCampaign(suffix, product.id);
    await seedCityZone(city);
    const lga = await prisma.geoLga.upsert({
      where: { stateCode_name: { stateCode: STATE_CODE, name: LGA_NAME } },
      update: { isActive: true },
      create: { stateCode: STATE_CODE, name: LGA_NAME, isActive: true },
    });
    const address = await prisma.address.create({
      data: {
        userId: customer.id,
        addressLine1: '1 Refusal Street',
        city,
        state: STATE_NAME,
        stateCode: STATE_CODE,
        lgaId: lga.id,
        countryCode: 'NG',
        country: 'Nigeria',
      },
    });
    const { agent, csrf } = await loginAgent(customer.email);
    const body = {
      shippingAddressId: address.id,
      items: [{ variantId: variant.id, quantity: 1 }],
    };
    const post = (path: string, payload: Record<string, unknown>) =>
      agent
        .post(path)
        .set('Origin', CUSTOMER_ORIGIN)
        .set('x-csrf-token', csrf)
        .send(payload);

    // The state is active and so is the LGA: priced, and an order exists.
    await post('/v1/orders/quote', body).expect(200);
    const existing = await orders.create(customer.id, {
      ...body,
      idempotencyKey: `live-${suffix}`,
    });

    await prisma.geoLga.update({
      where: { id: lga.id },
      data: { isActive: false },
    });
    try {
      const before = await writesFor(customer.id, variant.id);
      const responses = [
        await post('/v1/orders/quote', body),
        await post(`/v1/campaigns/${campaign.id}/orders/quote`, body),
        await post('/v1/orders', { ...body, idempotencyKey: `n1-${suffix}` }),
        await post(`/v1/campaigns/${campaign.id}/orders`, {
          ...body,
          idempotencyKey: `n2-${suffix}`,
        }),
      ];
      for (const res of responses) {
        expect(res.status).toBe(400);
        expect(res.body).toMatchObject({
          code: NOT_DELIVERABLE,
          message: MESSAGE,
        });
      }
      expect(await writesFor(customer.id, variant.id)).toEqual(before);

      // The order created before the deactivation replays by its key.
      const replay = await orders.create(customer.id, {
        ...body,
        idempotencyKey: `live-${suffix}`,
      });
      expect(replay.id).toBe(existing.id);
    } finally {
      await prisma.geoLga.update({
        where: { id: lga.id },
        data: { isActive: true },
      });
    }
    await post('/v1/orders/quote', body).expect(200);
  });

  it('lets an order created before the deactivation replay, be paid and complete', async () => {
    const suffix = `live-${Date.now()}`;
    const city = `Refuse City ${suffix}`;
    const { customer, variant } = await seedCustomerWithVariant(suffix);
    await seedCityZone(city);
    const address = await createAddress(customer.id, city, STATE_CODE);
    const dto = {
      shippingAddressId: address.id,
      items: [{ variantId: variant.id, quantity: 2 }],
      idempotencyKey: `key-${suffix}`,
    };

    const created = await orders.create(customer.id, dto);
    expect(created.status).toBe(OrderStatus.PENDING_PAYMENT);

    await setStateActive(false);
    try {
      // A new order for the same address is refused...
      await expectNotDeliverable(
        orders.create(customer.id, {
          ...dto,
          idempotencyKey: `other-${suffix}`,
        }),
      );

      // ...but the same key replays the order that already exists.
      const replay = await orders.create(customer.id, dto);
      expect(replay.id).toBe(created.id);
      expect(await prisma.order.count({ where: { userId: customer.id } })).toBe(
        1,
      );

      // Payment initiation of the existing order is untouched.
      jest
        .spyOn(app.get(PaystackTransactionClient), 'initialize')
        .mockResolvedValue({
          authorizationUrl: `https://checkout.paystack.test/${suffix}`,
          reference: `ref-${suffix}`,
          accessCode: `ac-${suffix}`,
        });
      const initiated = await payments.initiatePayment(
        created.id,
        customer.id,
        customer.email,
      );
      expect(initiated.authorizationUrl).toContain('checkout.paystack.test');

      // So is settlement: the order is paid.
      const payment = await prisma.payment.findFirstOrThrow({
        where: { orderId: created.id },
      });
      await webhooks.processChargeSuccess({
        event: 'charge.success',
        data: {
          reference: payment.providerRef ?? '',
          status: 'success',
          amount: Math.round(Number(created.totalAmount) * 100),
          currency: 'NGN',
        },
      });
      const paid = await prisma.order.findUniqueOrThrow({
        where: { id: created.id },
      });
      expect(paid.status).toBe(OrderStatus.PAID);
      expect(paid.paymentStatus).toBe(PaymentStatus.SUCCEEDED);
    } finally {
      jest.restoreAllMocks();
      await setStateActive(true);
    }
  });
});
