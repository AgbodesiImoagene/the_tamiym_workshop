import {
  BadRequestException,
  ForbiddenException,
  INestApplication,
} from '@nestjs/common';
import { App } from 'supertest/types';
import * as bcrypt from 'bcrypt';
import { closeE2eApp, createE2eApp } from './utils/create-e2e-app';
import { PrismaService } from '../src/prisma/prisma.service';
import { OrdersService } from '../src/orders/orders.service';
import {
  CurrencyCode,
  ModerationStatus,
  ProductStatus,
  ShippingRateProvider,
  ShippingRuleMatchType,
  UserRole,
  UserStatus,
} from '../src/generated/prisma/enums';
import { ensureLga } from './utils/geo-fixtures';

const PASSWORD = 'TestPassword1!';

/**
 * TTW-058: a customer orders saved designs. Two designs on one variant stay two
 * order items; only the owner can order a design, on its own product; a rejected
 * design cannot be ordered, while a pending or flagged one can (client answer Q28).
 * Real Postgres, real services.
 */
describe('Order saved designs (e2e)', () => {
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

  async function createUser(label: string) {
    return prisma.user.create({
      data: {
        email: `${label}@example.com`,
        passwordHash: await bcrypt.hash(PASSWORD, 10),
        role: UserRole.CUSTOMER,
        status: UserStatus.ACTIVE,
        emailVerifiedAt: new Date(),
        firstName: 'Design',
        lastName: 'Buyer',
      },
    });
  }

  async function createProduct(suffix: string, variantNames: string[]) {
    const category = await prisma.category.create({
      data: { name: `Design Cat ${suffix}`, slug: `design-cat-${suffix}` },
    });
    const product = await prisma.product.create({
      data: {
        name: `Design Product ${suffix}`,
        slug: `design-product-${suffix}`,
        status: ProductStatus.ACTIVE,
        categoryId: category.id,
        prices: { create: { currency: CurrencyCode.NGN, amount: 5000 } },
      },
    });
    const variants = [];
    for (const name of variantNames) {
      const variant = await prisma.productVariant.create({
        data: { productId: product.id, name, sku: `SKU-${suffix}-${name}` },
      });
      await prisma.inventoryItem.create({
        data: {
          variantId: variant.id,
          stockOnHand: 50,
          reserved: 0,
          trackInventory: true,
          lowStockThreshold: 0,
        },
      });
      variants.push(variant);
    }
    return { product, variants };
  }

  async function seedShipping(suffix: string, userId: string) {
    await prisma.geoState.upsert({
      where: { code: 'LA' },
      update: { isActive: true },
      create: { code: 'LA', name: 'Lagos', isActive: true },
    });
    const zone = await prisma.shippingZone.create({
      data: { name: `Design Lagos ${suffix}`, isActive: true },
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
    return prisma.address.create({
      data: {
        userId,
        addressLine1: '1 Design Street',
        city: 'Ikeja',
        state: 'Lagos',
        stateCode: 'LA',
        lgaId: (await ensureLga(prisma)).id,
        countryCode: 'NG',
        country: 'Nigeria',
      },
    });
  }

  function createDesign(
    userId: string,
    productId: string,
    name: string,
    moderationStatus: ModerationStatus = ModerationStatus.APPROVED,
  ) {
    return prisma.design.create({
      data: { userId, productId, name, designData: {}, moderationStatus },
    });
  }

  async function setup(label: string, variantNames = ['M']) {
    const suffix = `${label}-${Date.now()}`;
    const customer = await createUser(`design-cust-${suffix}`);
    const { product, variants } = await createProduct(suffix, variantNames);
    const address = await seedShipping(suffix, customer.id);
    return { suffix, customer, product, variants, address };
  }

  it('keeps two designs on the same variant as two order items', async () => {
    const { customer, product, variants, address } = await setup('two');
    const first = await createDesign(customer.id, product.id, 'First');
    const second = await createDesign(customer.id, product.id, 'Second');

    const created = await orders.create(customer.id, {
      shippingAddressId: address.id,
      items: [
        { variantId: variants[0].id, designId: first.id, quantity: 1 },
        { variantId: variants[0].id, designId: second.id, quantity: 2 },
      ],
    });

    const items = await prisma.orderItem.findMany({
      where: { orderId: created.id },
      orderBy: { quantity: 'asc' },
    });
    expect(items.map((i) => [i.variantId, i.designId, i.quantity])).toEqual([
      [variants[0].id, first.id, 1],
      [variants[0].id, second.id, 2],
    ]);
  });

  it('keeps one design in two variants as two order items', async () => {
    const { customer, product, variants, address } = await setup('sizes', [
      'M',
      'L',
    ]);
    const design = await createDesign(customer.id, product.id, 'Mine');

    const created = await orders.create(customer.id, {
      shippingAddressId: address.id,
      items: [
        { variantId: variants[0].id, designId: design.id, quantity: 1 },
        { variantId: variants[1].id, designId: design.id, quantity: 1 },
      ],
    });

    const items = await prisma.orderItem.findMany({
      where: { orderId: created.id },
    });
    expect(items.map((i) => i.variantId).sort()).toEqual(
      [variants[0].id, variants[1].id].sort(),
    );
    expect(items.every((i) => i.designId === design.id)).toBe(true);
  });

  it("refuses another customer's design and a design of another product", async () => {
    const { customer, product, variants, address } = await setup('own');
    const other = await createUser(`design-other-${Date.now()}`);
    const foreign = await createDesign(other.id, product.id, 'Not mine');
    const { product: otherProduct } = await createProduct(
      `own2-${Date.now()}`,
      ['S'],
    );
    const wrongProduct = await createDesign(
      customer.id,
      otherProduct.id,
      'Wrong product',
    );

    await expect(
      orders.create(customer.id, {
        shippingAddressId: address.id,
        items: [
          { variantId: variants[0].id, designId: foreign.id, quantity: 1 },
        ],
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    await expect(
      orders.create(customer.id, {
        shippingAddressId: address.id,
        items: [
          { variantId: variants[0].id, designId: wrongProduct.id, quantity: 1 },
        ],
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(await prisma.order.count({ where: { userId: customer.id } })).toBe(
      0,
    );
  });

  it('refuses a rejected design and creates no order', async () => {
    const { customer, product, variants, address } = await setup('rejected');
    const rejected = await createDesign(
      customer.id,
      product.id,
      'Rejected',
      ModerationStatus.REJECTED,
    );

    await expect(
      orders.create(customer.id, {
        shippingAddressId: address.id,
        items: [
          { variantId: variants[0].id, designId: rejected.id, quantity: 1 },
        ],
      }),
    ).rejects.toMatchObject({
      response: { code: 'DESIGN_REJECTED' },
    });
    expect(await prisma.order.count({ where: { userId: customer.id } })).toBe(
      0,
    );
  });

  it('does not wait for moderation: pending and flagged designs can be ordered', async () => {
    const { customer, product, variants, address } = await setup('pending');
    const pending = await createDesign(
      customer.id,
      product.id,
      'Pending',
      ModerationStatus.PENDING,
    );
    const flagged = await createDesign(
      customer.id,
      product.id,
      'Flagged',
      ModerationStatus.FLAGGED,
    );

    const created = await orders.create(customer.id, {
      shippingAddressId: address.id,
      items: [
        { variantId: variants[0].id, designId: pending.id, quantity: 1 },
        { variantId: variants[0].id, designId: flagged.id, quantity: 1 },
      ],
    });
    expect(
      await prisma.orderItem.count({ where: { orderId: created.id } }),
    ).toBe(2);
  });
});
