import { INestApplication } from '@nestjs/common';
import { App } from 'supertest/types';
import * as bcrypt from 'bcrypt';
import { closeE2eApp, createE2eApp } from './utils/create-e2e-app';
import { PrismaService } from '../src/prisma/prisma.service';
import { OrdersService } from '../src/orders/orders.service';
import { AddressesService } from '../src/addresses/addresses.service';
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

/**
 * TTW-198: delivery instructions entered on an address are copied to the order,
 * read back by the customer and the admin from that snapshot, unchanged by a later
 * address edit, and cleared by the privacy erasure.
 */
describe('Order delivery instructions (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let orders: OrdersService;
  let addresses: AddressesService;
  let privacy: PrivacyService;

  const PASSWORD = 'TestPassword1!';

  beforeAll(async () => {
    app = await createE2eApp();
    prisma = app.get(PrismaService);
    orders = app.get(OrdersService);
    addresses = app.get(AddressesService);
    privacy = app.get(PrivacyService);
  });

  afterAll(async () => {
    await closeE2eApp(app);
  });

  async function seed(suffix: string, instructions?: string) {
    const passwordHash = await bcrypt.hash(PASSWORD, 10);
    const customer = await prisma.user.create({
      data: {
        email: `instr-cust-${suffix}@example.com`,
        passwordHash,
        role: UserRole.CUSTOMER,
        status: UserStatus.ACTIVE,
        emailVerifiedAt: new Date(),
        firstName: 'Instr',
        lastName: 'Cust',
      },
    });
    const category = await prisma.category.create({
      data: { name: `Instr Cat ${suffix}`, slug: `instr-cat-${suffix}` },
    });
    const product = await prisma.product.create({
      data: {
        name: `Instr Product ${suffix}`,
        slug: `instr-product-${suffix}`,
        status: ProductStatus.ACTIVE,
        categoryId: category.id,
        prices: { create: { currency: CurrencyCode.NGN, amount: 5000 } },
      },
    });
    const variant = await prisma.productVariant.create({
      data: {
        productId: product.id,
        name: 'Default',
        sku: `SKU-INSTR-${suffix}`,
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
    await prisma.geoState.upsert({
      where: { code: 'LA' },
      update: { isActive: true },
      create: { code: 'LA', name: 'Lagos', isActive: true },
    });
    const zone = await prisma.shippingZone.create({
      data: { name: `Instr Lagos ${suffix}`, isActive: true },
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
    // Created through the service, as the API does, so normalization runs.
    const address = await addresses.create(customer.id, {
      addressLine1: '1 Instr Street',
      city: 'Ikeja',
      state: 'Lagos',
      stateCode: 'LA',
      countryCode: 'NG',
      country: 'Nigeria',
      ...(instructions === undefined ? {} : { instructions }),
    });
    return { customer, variant, address };
  }

  function placeOrder(
    customerId: string,
    addressId: string,
    variantId: string,
    suffix: string,
  ) {
    return orders.create(customerId, {
      shippingAddressId: addressId,
      items: [{ variantId, quantity: 1 }],
      idempotencyKey: `instr-key-${suffix}`,
    });
  }

  it('shows the instructions to the customer and the admin from the order snapshot', async () => {
    const suffix = `read-${Date.now()}`;
    const text = 'Ring twice.\nLeave with the guard <b>please</b>';
    const { customer, variant, address } = await seed(suffix, text);
    const order = await placeOrder(customer.id, address.id, variant.id, suffix);

    const asCustomer = await orders.findOne(customer.id, order.id);
    expect(asCustomer.shipping.instructions).toBe(text);

    const asAdmin = await orders.findOneForAdmin(order.id);
    expect(asAdmin.shipInstructions).toBe(text);
    expect(asAdmin.shipLandmark).toBeNull();
  });

  it('keeps the order unchanged when the address is edited or emptied afterwards', async () => {
    const suffix = `edit-${Date.now()}`;
    const { customer, variant, address } = await seed(suffix, 'Gate code 4321');
    const order = await placeOrder(customer.id, address.id, variant.id, suffix);

    await addresses.update(customer.id, address.id, {
      instructions: 'Different text',
    });
    await addresses.update(customer.id, address.id, { instructions: null });
    const edited = await prisma.address.findUniqueOrThrow({
      where: { id: address.id },
    });
    expect(edited.instructions).toBeNull();

    const asCustomer = await orders.findOne(customer.id, order.id);
    expect(asCustomer.shipping.instructions).toBe('Gate code 4321');
    const asAdmin = await orders.findOneForAdmin(order.id);
    expect(asAdmin.shipInstructions).toBe('Gate code 4321');
  });

  it('returns null when the address had no instructions', async () => {
    const suffix = `none-${Date.now()}`;
    const { customer, variant, address } = await seed(suffix);
    const order = await placeOrder(customer.id, address.id, variant.id, suffix);

    const asCustomer = await orders.findOne(customer.id, order.id);
    expect(asCustomer.shipping.instructions).toBeNull();
    expect(
      (await orders.findOneForAdmin(order.id)).shipInstructions,
    ).toBeNull();
  });

  it('clears the instructions of the order when the account is erased', async () => {
    const suffix = `erase-${Date.now()}`;
    const { customer, variant, address } = await seed(
      suffix,
      'Call on arrival',
    );
    const order = await placeOrder(customer.id, address.id, variant.id, suffix);
    // Erasure is refused while an order is still open.
    await prisma.order.update({
      where: { id: order.id },
      data: { status: OrderStatus.DELIVERED },
    });

    await privacy.requestErasure(customer.id, PASSWORD);

    const row = await prisma.order.findUniqueOrThrow({
      where: { id: order.id },
    });
    expect(row.shipInstructions).toBeNull();
    const addressRow = await prisma.address.findUniqueOrThrow({
      where: { id: address.id },
    });
    expect(addressRow.instructions).toBeNull();
  });
});
