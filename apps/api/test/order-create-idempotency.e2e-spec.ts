import { INestApplication } from '@nestjs/common';
import { App } from 'supertest/types';
import * as bcrypt from 'bcrypt';
import { closeE2eApp, createE2eApp } from './utils/create-e2e-app';
import { PrismaService } from '../src/prisma/prisma.service';
import { OrdersService } from '../src/orders/orders.service';
import {
  CampaignStatus,
  CurrencyCode,
  InventoryMovementKind,
  ModerationStatus,
  OrderStatus,
  ProductStatus,
  ShippingRateProvider,
  ShippingRuleMatchType,
  UserRole,
  UserStatus,
} from '../src/generated/prisma/enums';

/**
 * TTW-037: one idempotency key creates at most one order and one inventory
 * reservation, for sequential and concurrent creates, standard and campaign.
 */
describe('Order create idempotency (e2e)', () => {
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

  async function seedPurchasableVariant(suffix: string, stockOnHand = 10) {
    const passwordHash = await bcrypt.hash('TestPassword1!', 10);
    const customer = await prisma.user.create({
      data: {
        email: `idem-cust-${suffix}@example.com`,
        passwordHash,
        role: UserRole.CUSTOMER,
        status: UserStatus.ACTIVE,
        emailVerifiedAt: new Date(),
        firstName: 'Idem',
        lastName: 'Cust',
      },
    });
    const category = await prisma.category.create({
      data: { name: `Idem Cat ${suffix}`, slug: `idem-cat-${suffix}` },
    });
    const product = await prisma.product.create({
      data: {
        name: `Idem Product ${suffix}`,
        slug: `idem-product-${suffix}`,
        status: ProductStatus.ACTIVE,
        categoryId: category.id,
        prices: { create: { currency: CurrencyCode.NGN, amount: 5000 } },
      },
    });
    const variant = await prisma.productVariant.create({
      data: {
        productId: product.id,
        name: 'Default',
        sku: `SKU-IDEM-${suffix}`,
      },
    });
    await prisma.inventoryItem.create({
      data: {
        variantId: variant.id,
        stockOnHand,
        reserved: 0,
        trackInventory: true,
        lowStockThreshold: 0,
      },
    });

    await prisma.geoState.upsert({
      where: { code: 'LA' },
      update: { isActive: true },
      create: { code: 'LA', name: 'Lagos', isActive: true },
    });
    const zone = await prisma.shippingZone.create({
      data: { name: `Idem Lagos ${suffix}`, isActive: true },
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
        minDeliveryDays: 2,
        maxDeliveryDays: 4,
      },
    });
    const address = await prisma.address.create({
      data: {
        userId: customer.id,
        addressLine1: '1 Idem Street',
        city: 'Ikeja',
        state: 'Lagos',
        stateCode: 'LA',
        countryCode: 'NG',
        country: 'Nigeria',
      },
    });

    return { customer, product, variant, address };
  }

  async function seedActiveCampaign(suffix: string, productId: string) {
    const passwordHash = await bcrypt.hash('TestPassword1!', 10);
    const organizer = await prisma.user.create({
      data: {
        email: `idem-org-${suffix}@example.com`,
        passwordHash,
        role: UserRole.ORGANIZER,
        status: UserStatus.ACTIVE,
        emailVerifiedAt: new Date(),
        firstName: 'Idem',
        lastName: 'Org',
      },
    });
    return prisma.campaign.create({
      data: {
        organizerId: organizer.id,
        title: `Idem Campaign ${suffix}`,
        slug: `idem-campaign-${suffix}`,
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

  async function reservationState(variantId: string, userId: string) {
    const [inventory, orderRows, reserveMovements] = await Promise.all([
      prisma.inventoryItem.findUniqueOrThrow({ where: { variantId } }),
      prisma.order.findMany({ where: { userId } }),
      prisma.inventoryMovement.count({
        where: {
          kind: InventoryMovementKind.RESERVE,
          order: { userId },
        },
      }),
    ]);
    return { reserved: inventory.reserved, orderRows, reserveMovements };
  }

  it('returns the same standard order for a sequential retry with the same key', async () => {
    const suffix = `seq-${Date.now()}`;
    const { customer, variant, address } = await seedPurchasableVariant(suffix);
    const dto = {
      shippingAddressId: address.id,
      items: [{ variantId: variant.id, quantity: 2 }],
      idempotencyKey: `key-${suffix}`,
    };

    const first = await orders.create(customer.id, dto);
    const second = await orders.create(customer.id, dto);

    expect(second.id).toBe(first.id);
    const state = await reservationState(variant.id, customer.id);
    expect(state.orderRows).toHaveLength(1);
    expect(state.reserved).toBe(2);
    expect(state.reserveMovements).toBe(1);
  });

  it('creates one standard order and one reservation for concurrent creates with the same key', async () => {
    const suffix = `conc-${Date.now()}`;
    const { customer, variant, address } = await seedPurchasableVariant(suffix);
    const dto = {
      shippingAddressId: address.id,
      items: [{ variantId: variant.id, quantity: 2 }],
      idempotencyKey: `key-${suffix}`,
    };

    const results = await Promise.allSettled([
      orders.create(customer.id, dto),
      orders.create(customer.id, dto),
    ]);

    expect(results.map((r) => r.status)).toEqual(['fulfilled', 'fulfilled']);
    const ids = results.map((r) =>
      r.status === 'fulfilled' ? r.value.id : null,
    );
    expect(ids[0]).toBe(ids[1]);

    const state = await reservationState(variant.id, customer.id);
    expect(state.orderRows).toHaveLength(1);
    expect(state.reserved).toBe(2);
    expect(state.reserveMovements).toBe(1);
  });

  it('creates one campaign order and one reservation for concurrent creates with the same key', async () => {
    const suffix = `camp-${Date.now()}`;
    const { customer, product, variant, address } =
      await seedPurchasableVariant(suffix);
    const campaign = await seedActiveCampaign(suffix, product.id);
    const dto = {
      shippingAddressId: address.id,
      items: [{ variantId: variant.id, quantity: 3 }],
      idempotencyKey: `key-${suffix}`,
    };

    const results = await Promise.allSettled([
      orders.createCampaignOrder(campaign.id, customer.id, dto),
      orders.createCampaignOrder(campaign.id, customer.id, dto),
    ]);

    expect(results.map((r) => r.status)).toEqual(['fulfilled', 'fulfilled']);
    const ids = results.map((r) =>
      r.status === 'fulfilled' ? r.value.id : null,
    );
    expect(ids[0]).toBe(ids[1]);

    const state = await reservationState(variant.id, customer.id);
    expect(state.orderRows).toHaveLength(1);
    expect(state.orderRows[0].campaignId).toBe(campaign.id);
    expect(state.reserved).toBe(3);
    expect(state.reserveMovements).toBe(1);

    const sequential = await orders.createCampaignOrder(
      campaign.id,
      customer.id,
      dto,
    );
    expect(sequential.id).toBe(ids[0]);
  });

  it('rejects reusing a standard order key for a campaign order without creating anything', async () => {
    const suffix = `kind-${Date.now()}`;
    const { customer, product, variant, address } =
      await seedPurchasableVariant(suffix);
    const campaign = await seedActiveCampaign(suffix, product.id);
    const dto = {
      shippingAddressId: address.id,
      items: [{ variantId: variant.id, quantity: 1 }],
      idempotencyKey: `key-${suffix}`,
    };

    await orders.create(customer.id, dto);
    await expect(
      orders.createCampaignOrder(campaign.id, customer.id, dto),
    ).rejects.toMatchObject({ status: 409 });

    const state = await reservationState(variant.id, customer.id);
    expect(state.orderRows).toHaveLength(1);
    expect(state.reserved).toBe(1);
  });

  // Review finding 6: a key replays only the same request content.
  it('stores a fingerprint on every keyed order, standard and campaign', async () => {
    const suffix = `fp-${Date.now()}`;
    const { customer, product, variant, address } =
      await seedPurchasableVariant(suffix);
    const campaign = await seedActiveCampaign(suffix, product.id);

    await orders.create(customer.id, {
      shippingAddressId: address.id,
      items: [{ variantId: variant.id, quantity: 1 }],
      idempotencyKey: `key-std-${suffix}`,
    });
    await orders.createCampaignOrder(campaign.id, customer.id, {
      shippingAddressId: address.id,
      items: [{ variantId: variant.id, quantity: 1 }],
      idempotencyKey: `key-camp-${suffix}`,
    });

    const rows = await prisma.order.findMany({
      where: { userId: customer.id },
    });
    expect(rows).toHaveLength(2);
    for (const row of rows) {
      expect(row.idempotencyFingerprint).toMatch(/^v1:[0-9a-f]{64}$/);
    }
  });

  it('rejects the same key with a different quantity and creates nothing', async () => {
    const suffix = `qty-${Date.now()}`;
    const { customer, variant, address } = await seedPurchasableVariant(suffix);
    const key = `key-${suffix}`;

    await orders.create(customer.id, {
      shippingAddressId: address.id,
      items: [{ variantId: variant.id, quantity: 1 }],
      idempotencyKey: key,
    });
    await expect(
      orders.create(customer.id, {
        shippingAddressId: address.id,
        items: [{ variantId: variant.id, quantity: 2 }],
        idempotencyKey: key,
      }),
    ).rejects.toMatchObject({
      status: 409,
      response: { code: 'IDEMPOTENCY_KEY_PAYLOAD_MISMATCH' },
    });

    const state = await reservationState(variant.id, customer.id);
    expect(state.orderRows).toHaveLength(1);
    expect(state.reserved).toBe(1);
  });

  it('rejects the same key after the saved delivery address was edited', async () => {
    const suffix = `addr-${Date.now()}`;
    const { customer, variant, address } = await seedPurchasableVariant(suffix);
    const dto = {
      shippingAddressId: address.id,
      items: [{ variantId: variant.id, quantity: 1 }],
      idempotencyKey: `key-${suffix}`,
    };

    await orders.create(customer.id, dto);
    await prisma.address.update({
      where: { id: address.id },
      data: { addressLine1: '9 Other Street' },
    });

    await expect(orders.create(customer.id, dto)).rejects.toMatchObject({
      status: 409,
      response: { code: 'IDEMPOTENCY_KEY_PAYLOAD_MISMATCH' },
    });
    const state = await reservationState(variant.id, customer.id);
    expect(state.orderRows).toHaveLength(1);
  });

  it('refuses at the database level a keyed order without a fingerprint', async () => {
    const suffix = `chk-${Date.now()}`;
    const { customer, address } = await seedPurchasableVariant(suffix);

    await expect(
      prisma.order.create({
        data: {
          userId: customer.id,
          shippingAddressId: address.id,
          currency: 'NGN',
          subtotalAmount: 1000,
          totalAmount: 1000,
          shipLine1: address.addressLine1,
          shipCity: address.city,
          shipState: 'Lagos',
          shipCountry: 'Nigeria',
          idempotencyKey: `key-${suffix}`,
        },
      }),
    ).rejects.toThrow(/orders_idempotency_fingerprint_required/);
    expect(await prisma.order.count({ where: { userId: customer.id } })).toBe(
      0,
    );
  });

  // Independent review finding 1: every existing keyed order satisfies the
  // constraint, so none of them is blocked from later status updates.
  it('validates the fingerprint constraint for every existing keyed order', async () => {
    const [constraint] = await prisma.$queryRaw<
      Array<{ convalidated: boolean }>
    >`
      SELECT convalidated FROM pg_constraint
      WHERE conname = 'orders_idempotency_fingerprint_required'`;
    expect(constraint?.convalidated).toBe(true);

    const [{ count }] = await prisma.$queryRaw<Array<{ count: bigint }>>`
      SELECT count(*)::bigint AS count FROM orders
      WHERE "idempotencyKey" IS NOT NULL AND "idempotencyFingerprint" IS NULL`;
    expect(Number(count)).toBe(0);
  });

  it('keeps a backfilled legacy keyed order updatable and never replays it', async () => {
    const suffix = `legacy-${Date.now()}`;
    const { customer, variant, address } = await seedPurchasableVariant(suffix);
    const key = `key-${suffix}`;
    const legacy = await prisma.order.create({
      data: {
        userId: customer.id,
        shippingAddressId: address.id,
        currency: 'NGN',
        subtotalAmount: 1000,
        totalAmount: 1000,
        shipLine1: address.addressLine1,
        shipCity: address.city,
        shipState: 'Lagos',
        shipCountry: 'Nigeria',
        idempotencyKey: key,
        idempotencyFingerprint: 'legacy:unreplayable',
      },
    });

    await prisma.order.update({
      where: { id: legacy.id },
      data: { status: OrderStatus.CANCELLED },
    });

    await expect(
      orders.create(customer.id, {
        shippingAddressId: address.id,
        items: [{ variantId: variant.id, quantity: 1 }],
        idempotencyKey: key,
      }),
    ).rejects.toMatchObject({
      status: 409,
      response: { code: 'IDEMPOTENCY_KEY_PAYLOAD_MISMATCH' },
    });
  });
});
