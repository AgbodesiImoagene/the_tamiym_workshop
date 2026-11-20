import { INestApplication } from '@nestjs/common';
import { App } from 'supertest/types';
import * as bcrypt from 'bcrypt';
import { closeE2eApp, createE2eApp } from './utils/create-e2e-app';
import { PrismaService } from '../src/prisma/prisma.service';
import { OrdersService } from '../src/orders/orders.service';
import { ShippingAdminService } from '../src/shipping/shipping-admin.service';
import {
  CurrencyCode,
  ProductStatus,
  ShippingRuleMatchType,
  UserRole,
  UserStatus,
} from '../src/generated/prisma/enums';

const PASSWORD = 'TestPassword1!';

/**
 * TTW-098: a rate can charge by quantity or weight brackets. Runs the
 * production AppModule against real Postgres: the nested bracket write, the
 * quote, and the breakdown frozen on the order.
 */
describe('Shipping rate brackets (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let orders: OrdersService;
  let shippingAdmin: ShippingAdminService;

  beforeAll(async () => {
    app = await createE2eApp();
    prisma = app.get(PrismaService);
    orders = app.get(OrdersService);
    shippingAdmin = app.get(ShippingAdminService);
  });

  afterAll(async () => {
    await closeE2eApp(app);
  });

  async function seedShopper(suffix: string, weightGrams: number | null) {
    const customer = await prisma.user.create({
      data: {
        email: `brk-cust-${suffix}@example.com`,
        passwordHash: await bcrypt.hash(PASSWORD, 10),
        role: UserRole.CUSTOMER,
        status: UserStatus.ACTIVE,
        emailVerifiedAt: new Date(),
        firstName: 'Brk',
        lastName: 'Cust',
      },
    });
    const category = await prisma.category.create({
      data: { name: `Brk Cat ${suffix}`, slug: `brk-cat-${suffix}` },
    });
    const product = await prisma.product.create({
      data: {
        name: `Brk Product ${suffix}`,
        slug: `brk-product-${suffix}`,
        status: ProductStatus.ACTIVE,
        categoryId: category.id,
        weightGrams,
        prices: { create: { currency: CurrencyCode.NGN, amount: 5000 } },
      },
    });
    const variant = await prisma.productVariant.create({
      data: {
        productId: product.id,
        name: 'Default',
        sku: `SKU-BRK-${suffix}`,
      },
    });
    await prisma.inventoryItem.create({
      data: {
        variantId: variant.id,
        stockOnHand: 200,
        reserved: 0,
        trackInventory: true,
        lowStockThreshold: 0,
      },
    });
    const city = `Brk City ${suffix}`;
    const zone = await prisma.shippingZone.create({
      data: { name: `Brk Zone ${suffix}`, isActive: true },
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
    const address = await prisma.address.create({
      data: {
        userId: customer.id,
        addressLine1: '1 Bracket Street',
        city,
        state: `State ${city}`,
        stateCode: null,
        countryCode: 'NG',
        country: 'Nigeria',
      },
    });
    return { customer, variant, zone, address };
  }

  const order = (
    s: Awaited<ReturnType<typeof seedShopper>>,
    quantity: number,
  ) =>
    orders.create(s.customer.id, {
      shippingAddressId: s.address.id,
      items: [{ variantId: s.variant.id, quantity }],
    });

  it('charges 1 item and 12 items differently on a quantity rate, and freezes the bracket on the order', async () => {
    const shopper = await seedShopper(`qty-${Date.now()}`, null);
    const rate = await shippingAdmin.createRate(shopper.zone.id, {
      flatFee: 2000,
      bracketBasis: 'QUANTITY',
      brackets: [
        { minValue: 10, fee: 5000 },
        { minValue: 100, fee: 9000 },
      ],
    });

    const one = await order(shopper, 1);
    const twelve = await order(shopper, 12);

    expect(Number(one.shippingFee)).toBe(2000);
    expect(Number(twelve.shippingFee)).toBe(5000);
    expect(twelve.shippingBreakdown).toMatchObject({
      rateSource: 'ZONE_BRACKET_RATE',
      appliedFee: 5000,
      bracket: { basis: 'QUANTITY', minValue: 10, measuredValue: 12 },
    });

    // An admin edit later never rewrites what the order already froze.
    await shippingAdmin.updateRate(rate.id, { bracketBasis: null });
    const frozen = await prisma.order.findUniqueOrThrow({
      where: { id: twelve.id },
    });
    expect(Number(frozen.shippingFee)).toBe(5000);
    expect(frozen.shippingBreakdown).toMatchObject({
      rateSource: 'ZONE_BRACKET_RATE',
    });
    expect(Number((await order(shopper, 12)).shippingFee)).toBe(2000);
  });

  it('keeps the same fee for 1 or 12 items on a flat rate (existing rates)', async () => {
    const shopper = await seedShopper(`flat-${Date.now()}`, null);
    await shippingAdmin.createRate(shopper.zone.id, { flatFee: 2000 });

    expect(Number((await order(shopper, 1)).shippingFee)).toBe(2000);
    const twelve = await order(shopper, 12);
    expect(Number(twelve.shippingFee)).toBe(2000);
    expect(twelve.shippingBreakdown).toMatchObject({
      rateSource: 'ZONE_FLAT_RATE',
    });
  });

  it('charges by total weight on a weight rate', async () => {
    const shopper = await seedShopper(`wt-${Date.now()}`, 500);
    await shippingAdmin.createRate(shopper.zone.id, {
      flatFee: 2000,
      bracketBasis: 'WEIGHT_GRAMS',
      brackets: [{ minValue: 5000, fee: 7000 }],
    });

    // 9 x 500 g = 4500 g (below the bracket); 10 x 500 g = 5000 g (on it).
    expect(Number((await order(shopper, 9)).shippingFee)).toBe(2000);
    expect(Number((await order(shopper, 10)).shippingFee)).toBe(7000);
  });

  it('refuses a weight rate when the product has no weight, and writes no order', async () => {
    const shopper = await seedShopper(`noweight-${Date.now()}`, null);
    await shippingAdmin.createRate(shopper.zone.id, {
      flatFee: 2000,
      bracketBasis: 'WEIGHT_GRAMS',
      brackets: [{ minValue: 5000, fee: 7000 }],
    });

    const error: unknown = await order(shopper, 1).then(
      () => undefined,
      (e: unknown) => e,
    );
    expect(
      (error as { getResponse?: () => unknown }).getResponse?.(),
    ).toMatchObject({ code: 'SHIPPING_WEIGHT_UNKNOWN' });
    expect(
      await prisma.order.count({ where: { userId: shopper.customer.id } }),
    ).toBe(0);
  });

  it('replaces the brackets of a rate when an admin sends a new list', async () => {
    const shopper = await seedShopper(`edit-${Date.now()}`, null);
    const rate = await shippingAdmin.createRate(shopper.zone.id, {
      flatFee: 2000,
      bracketBasis: 'QUANTITY',
      brackets: [{ minValue: 10, fee: 5000 }],
    });

    await shippingAdmin.updateRate(rate.id, {
      brackets: [
        { minValue: 3, fee: 2500 },
        { minValue: 20, fee: 6000 },
      ],
    });

    const rows = await prisma.shippingRateBracket.findMany({
      where: { rateId: rate.id },
      orderBy: { minValue: 'asc' },
    });
    expect(rows.map((r) => [r.minValue, Number(r.fee)])).toEqual([
      [3, 2500],
      [20, 6000],
    ]);
    expect(Number((await order(shopper, 3)).shippingFee)).toBe(2500);
  });
});
