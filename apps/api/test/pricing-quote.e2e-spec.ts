import { INestApplication } from '@nestjs/common';
import { App } from 'supertest/types';
import * as bcrypt from 'bcrypt';
import { closeE2eApp, createE2eApp } from './utils/create-e2e-app';
import { PrismaService } from '../src/prisma/prisma.service';
import { PricingService } from '../src/pricing/pricing.service';
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
 * TTW-038: quotes and order creation run the real Prisma query shape against
 * Postgres. Mocked unit tests cannot catch an invalid `select`/`include` pair.
 * Tax settings are pinned (VAT 0, inclusive) because `seed:e2e` writes 7.5%
 * into the same database; the previous row is restored afterwards.
 */
describe('Pricing quote (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let pricing: PricingService;
  let orders: OrdersService;
  let previousTaxSettings: Awaited<ReturnType<typeof readTaxSettings>>;

  const PINNED_TAX_SETTINGS = {
    vatRate: 0,
    pricesIncludeVat: true,
    vatAppliesToShipping: true,
    currency: CurrencyCode.NGN,
  };

  beforeAll(async () => {
    app = await createE2eApp();
    prisma = app.get(PrismaService);
    pricing = app.get(PricingService);
    orders = app.get(OrdersService);

    previousTaxSettings = await readTaxSettings();
    await prisma.siteSettings.upsert({
      where: { id: 'default' },
      update: PINNED_TAX_SETTINGS,
      create: { id: 'default', ...PINNED_TAX_SETTINGS },
    });
  });

  afterAll(async () => {
    if (previousTaxSettings) {
      await prisma.siteSettings.update({
        where: { id: 'default' },
        data: previousTaxSettings,
      });
    } else {
      await prisma.siteSettings.delete({ where: { id: 'default' } });
    }
    await closeE2eApp(app);
  });

  function readTaxSettings() {
    return prisma.siteSettings.findUnique({
      where: { id: 'default' },
      select: {
        vatRate: true,
        pricesIncludeVat: true,
        vatAppliesToShipping: true,
        currency: true,
      },
    });
  }

  async function seedPurchasableVariant(suffix: string, stockOnHand = 10) {
    const passwordHash = await bcrypt.hash('TestPassword1!', 10);
    const customer = await prisma.user.create({
      data: {
        email: `quote-cust-${suffix}@example.com`,
        passwordHash,
        role: UserRole.CUSTOMER,
        status: UserStatus.ACTIVE,
        emailVerifiedAt: new Date(),
        firstName: 'Quote',
        lastName: 'Cust',
      },
    });
    const category = await prisma.category.create({
      data: { name: `Quote Cat ${suffix}`, slug: `quote-cat-${suffix}` },
    });
    const product = await prisma.product.create({
      data: {
        name: `Quote Product ${suffix}`,
        slug: `quote-product-${suffix}`,
        status: ProductStatus.ACTIVE,
        categoryId: category.id,
        prices: { create: { currency: CurrencyCode.NGN, amount: 5000 } },
      },
    });
    const variant = await prisma.productVariant.create({
      data: {
        productId: product.id,
        name: 'Default',
        sku: `SKU-QUOTE-${suffix}`,
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
      data: { name: `Quote Lagos ${suffix}`, isActive: true },
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
        addressLine1: '1 Quote Street',
        city: 'Ikeja',
        state: 'Lagos',
        stateCode: 'LA',
        countryCode: 'NG',
        country: 'Nigeria',
      },
    });

    return { customer, product, variant, address };
  }

  async function addOption(
    productId: string,
    variantId: string,
    spec: {
      code: string;
      name: string;
      valueCode: string;
      displayName: string;
      upcharge: number;
    },
  ) {
    const option = await prisma.productOption.create({
      data: { productId, code: spec.code, name: spec.name },
    });
    const value = await prisma.productOptionValue.create({
      data: {
        optionId: option.id,
        valueCode: spec.valueCode,
        displayName: spec.displayName,
        upcharges: {
          create: { currency: CurrencyCode.NGN, amount: spec.upcharge },
        },
      },
    });
    await prisma.variantOptionValue.create({
      data: { variantId, optionId: option.id, optionValueId: value.id },
    });
  }

  const SIZE_XL = {
    code: 'size',
    name: 'Size',
    valueCode: 'XL',
    displayName: 'Extra large',
    upcharge: 500,
  };
  const COLOUR_BLACK = {
    code: 'colour',
    name: 'Colour',
    valueCode: 'BLACK',
    displayName: 'Black',
    upcharge: 50.5,
  };

  async function seedActiveCampaign(suffix: string, productId: string) {
    const passwordHash = await bcrypt.hash('TestPassword1!', 10);
    const organizer = await prisma.user.create({
      data: {
        email: `quote-org-${suffix}@example.com`,
        passwordHash,
        role: UserRole.ORGANIZER,
        status: UserStatus.ACTIVE,
        emailVerifiedAt: new Date(),
        firstName: 'Quote',
        lastName: 'Org',
      },
    });
    return prisma.campaign.create({
      data: {
        organizerId: organizer.id,
        title: `Quote Campaign ${suffix}`,
        slug: `quote-campaign-${suffix}`,
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

  it('quotes a standard variant without options at the product price plus zone shipping', async () => {
    const suffix = `plain-${Date.now()}`;
    const { customer, variant, address } = await seedPurchasableVariant(suffix);

    const quote = await pricing.quoteStandard(customer.id, {
      shippingAddressId: address.id,
      items: [{ variantId: variant.id, quantity: 2 }],
    });

    expect(quote.currency).toBe(CurrencyCode.NGN);
    expect(quote.items).toHaveLength(1);
    expect(quote.items[0]).toMatchObject({
      unitBasePrice: 5000,
      unitFinalPrice: 5000,
      lineTotal: 10000,
      variantSnapshot: [],
    });
    expect(quote.items[0].pricingBreakdown.optionValueUpcharge).toBe(0);
    expect(quote.subtotalAmount).toBe(10000);
    expect(quote.shippingFee).toBe(2000);
    expect(quote.vatAmount).toBe(0);
    expect(quote.totalAmount).toBe(12000);
  });

  it('sums the NGN upcharges of every option value and snapshots their labels', async () => {
    const suffix = `option-${Date.now()}`;
    const { customer, product, variant, address } =
      await seedPurchasableVariant(suffix);
    await addOption(product.id, variant.id, SIZE_XL);
    await addOption(product.id, variant.id, COLOUR_BLACK);

    const quote = await pricing.quoteStandard(customer.id, {
      shippingAddressId: address.id,
      items: [{ variantId: variant.id, quantity: 1 }],
    });

    expect(quote.items[0]).toMatchObject({
      unitBasePrice: 5000,
      unitFinalPrice: 5550.5,
      lineTotal: 5550.5,
    });
    expect(quote.items[0].variantSnapshot).toHaveLength(2);
    expect(quote.items[0].variantSnapshot).toEqual(
      expect.arrayContaining([
        {
          option: 'Size',
          optionCode: 'size',
          value: 'Extra large',
          valueCode: 'XL',
        },
        {
          option: 'Colour',
          optionCode: 'colour',
          value: 'Black',
          valueCode: 'BLACK',
        },
      ]),
    );
    expect(quote.items[0].pricingBreakdown.optionValueUpcharge).toBe(550.5);
    expect(quote.subtotalAmount).toBe(5550.5);
    expect(quote.shippingFee).toBe(2000);
    expect(quote.vatAmount).toBe(0);
    // NGN totals round to the nearest 100: 7550.50 → 7600.
    expect(quote.totalBeforeDisplayRounding).toBe(7550.5);
    expect(quote.totalAmount).toBe(7600);
    expect(quote.roundingAdjustment).toBe(49.5);
  });

  it('quotes an active campaign product at the campaign price plus option upcharge', async () => {
    const suffix = `campaign-${Date.now()}`;
    const { customer, product, variant, address } =
      await seedPurchasableVariant(suffix);
    await addOption(product.id, variant.id, SIZE_XL);
    const campaign = await seedActiveCampaign(suffix, product.id);

    const quote = await pricing.quoteCampaign(customer.id, campaign.id, {
      shippingAddressId: address.id,
      items: [{ variantId: variant.id, quantity: 1 }],
    });

    expect(quote.items[0]).toMatchObject({
      campaignId: campaign.id,
      unitBasePrice: 8000,
      unitFinalPrice: 8500,
      lineTotal: 8500,
    });
    expect(quote.items[0].pricingBreakdown.optionValueUpcharge).toBe(500);
    expect(quote.subtotalAmount).toBe(8500);
    expect(quote.shippingFee).toBe(2000);
    expect(quote.vatAmount).toBe(0);
    expect(quote.totalAmount).toBe(10500);
  });

  it('creates a pending-payment standard order with one stock reservation', async () => {
    const suffix = `order-${Date.now()}`;
    const { customer, variant, address } = await seedPurchasableVariant(suffix);

    const order = await orders.create(customer.id, {
      shippingAddressId: address.id,
      items: [{ variantId: variant.id, quantity: 2 }],
    });

    expect(order.status).toBe(OrderStatus.PENDING_PAYMENT);
    expect(Number(order.totalAmount)).toBe(12000);
    const [inventory, reserveMovements] = await Promise.all([
      prisma.inventoryItem.findUniqueOrThrow({
        where: { variantId: variant.id },
      }),
      prisma.inventoryMovement.count({
        where: { kind: InventoryMovementKind.RESERVE, orderId: order.id },
      }),
    ]);
    expect(inventory.reserved).toBe(2);
    expect(reserveMovements).toBe(1);
  });
});
