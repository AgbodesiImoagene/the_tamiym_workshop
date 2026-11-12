import { INestApplication, NotFoundException } from '@nestjs/common';
import { App } from 'supertest/types';
import * as bcrypt from 'bcrypt';
import { closeE2eApp, createE2eApp } from './utils/create-e2e-app';
import { PrismaService } from '../src/prisma/prisma.service';
import { OrdersService } from '../src/orders/orders.service';
import { PrivacyService } from '../src/privacy/privacy.service';
import {
  CurrencyCode,
  OrderStatus,
  ProductStatus,
  ShippingRateProvider,
  ShippingRuleMatchType,
  UserRole,
  UserStatus,
} from '../src/generated/prisma/enums';

const PASSWORD = 'TestPassword1!';

/**
 * TTW-197: the optional order note is stored on the order, read back by the
 * owner and by the admin, takes part in idempotency, and is erased with the
 * other personal data. Real Postgres, real services.
 */
describe('Order customer note (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let orders: OrdersService;
  let privacy: PrivacyService;

  beforeAll(async () => {
    app = await createE2eApp();
    prisma = app.get(PrismaService);
    orders = app.get(OrdersService);
    privacy = app.get(PrivacyService);
  });

  afterAll(async () => {
    await closeE2eApp(app);
  });

  async function seedCustomerWithVariant(suffix: string) {
    const passwordHash = await bcrypt.hash(PASSWORD, 10);
    const customer = await prisma.user.create({
      data: {
        email: `note-cust-${suffix}@example.com`,
        passwordHash,
        role: UserRole.CUSTOMER,
        status: UserStatus.ACTIVE,
        emailVerifiedAt: new Date(),
        firstName: 'Note',
        lastName: 'Cust',
      },
    });
    const category = await prisma.category.create({
      data: { name: `Note Cat ${suffix}`, slug: `note-cat-${suffix}` },
    });
    const product = await prisma.product.create({
      data: {
        name: `Note Product ${suffix}`,
        slug: `note-product-${suffix}`,
        status: ProductStatus.ACTIVE,
        categoryId: category.id,
        prices: { create: { currency: CurrencyCode.NGN, amount: 5000 } },
      },
    });
    const variant = await prisma.productVariant.create({
      data: {
        productId: product.id,
        name: 'Default',
        sku: `SKU-NOTE-${suffix}`,
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
    await prisma.geoState.upsert({
      where: { code: 'LA' },
      update: { isActive: true },
      create: { code: 'LA', name: 'Lagos', isActive: true },
    });
    const zone = await prisma.shippingZone.create({
      data: { name: `Note Lagos ${suffix}`, isActive: true },
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
        addressLine1: '1 Note Street',
        city: 'Ikeja',
        state: 'Lagos',
        stateCode: 'LA',
        countryCode: 'NG',
        country: 'Nigeria',
      },
    });
    return { customer, variant, address };
  }

  const NOTE = 'Pack the two hoodies separately <b>please</b>';

  it('stores the note and shows it to the owner and to the admin', async () => {
    const suffix = `read-${Date.now()}`;
    const { customer, variant, address } =
      await seedCustomerWithVariant(suffix);

    const created = await orders.create(customer.id, {
      shippingAddressId: address.id,
      items: [{ variantId: variant.id, quantity: 2 }],
      customerNote: NOTE,
    });

    const row = await prisma.order.findUniqueOrThrow({
      where: { id: created.id },
    });
    expect(row.customerNote).toBe(NOTE);
    // The note changes no money field.
    expect(Number(row.totalAmount)).toBe(12000);

    const owned = await orders.findOne(customer.id, created.id);
    expect(owned.customerNote).toBe(NOTE);

    const admin = await orders.findOneForAdmin(created.id);
    expect(admin.customerNote).toBe(NOTE);
  });

  it('keeps null for an order created without a note', async () => {
    const suffix = `none-${Date.now()}`;
    const { customer, variant, address } =
      await seedCustomerWithVariant(suffix);

    const created = await orders.create(customer.id, {
      shippingAddressId: address.id,
      items: [{ variantId: variant.id, quantity: 1 }],
    });

    expect(
      (await orders.findOne(customer.id, created.id)).customerNote,
    ).toBeNull();
    expect((await orders.findOneForAdmin(created.id)).customerNote).toBeNull();
  });

  it('does not show the note to another customer', async () => {
    const suffix = `other-${Date.now()}`;
    const { customer, variant, address } =
      await seedCustomerWithVariant(suffix);
    const created = await orders.create(customer.id, {
      shippingAddressId: address.id,
      items: [{ variantId: variant.id, quantity: 1 }],
      customerNote: NOTE,
    });

    await expect(
      orders.findOne('someone-else', created.id),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('replays the same key with the same note and refuses another note', async () => {
    const suffix = `idem-${Date.now()}`;
    const { customer, variant, address } =
      await seedCustomerWithVariant(suffix);
    const dto = {
      shippingAddressId: address.id,
      items: [{ variantId: variant.id, quantity: 1 }],
      idempotencyKey: `key-${suffix}`,
      customerNote: 'First note',
    };

    const first = await orders.create(customer.id, dto);
    const again = await orders.create(customer.id, dto);
    expect(again.id).toBe(first.id);

    for (const customerNote of ['Another note', undefined]) {
      await expect(
        orders.create(customer.id, { ...dto, customerNote }),
      ).rejects.toMatchObject({
        response: { code: 'IDEMPOTENCY_KEY_PAYLOAD_MISMATCH' },
      });
    }
    expect(await prisma.order.count({ where: { userId: customer.id } })).toBe(
      1,
    );
  });

  it('keeps replaying an order created before the note existed', async () => {
    const suffix = `legacy-${Date.now()}`;
    const { customer, variant, address } =
      await seedCustomerWithVariant(suffix);
    const dto = {
      shippingAddressId: address.id,
      items: [{ variantId: variant.id, quantity: 1 }],
      idempotencyKey: `key-${suffix}`,
    };
    const first = await orders.create(customer.id, dto);
    const again = await orders.create(customer.id, dto);
    expect(again.id).toBe(first.id);
  });

  it('clears the note when the account is erased, and exports it before', async () => {
    const suffix = `erase-${Date.now()}`;
    const { customer, variant, address } =
      await seedCustomerWithVariant(suffix);
    const created = await orders.create(customer.id, {
      shippingAddressId: address.id,
      items: [{ variantId: variant.id, quantity: 1 }],
      customerNote: NOTE,
    });

    const exported = await privacy.requestExport(customer.id, PASSWORD);
    const pkg = await privacy.downloadExport(
      customer.id,
      exported.id,
      PASSWORD,
    );
    expect(
      (
        pkg.data.orders as Array<{ id: string; customerNote: string | null }>
      ).find((o) => o.id === created.id)?.customerNote,
    ).toBe(NOTE);

    // Erasure is refused while an order is open.
    await prisma.order.update({
      where: { id: created.id },
      data: { status: OrderStatus.CANCELLED },
    });
    await privacy.requestErasure(customer.id, PASSWORD);

    const row = await prisma.order.findUniqueOrThrow({
      where: { id: created.id },
    });
    expect(row.customerNote).toBeNull();
    expect(row.shipLine1).toBe('REDACTED');
  });
});
