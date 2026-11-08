import { INestApplication, ServiceUnavailableException } from '@nestjs/common';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { App } from 'supertest/types';
import * as bcrypt from 'bcrypt';
import { closeE2eApp, createE2eApp } from './utils/create-e2e-app';
import { PrismaService } from '../src/prisma/prisma.service';
import { PricingService } from '../src/pricing/pricing.service';
import { OrdersService } from '../src/orders/orders.service';
import {
  CurrencyCode,
  ProductStatus,
  ShippingRateProvider,
  ShippingRuleMatchType,
  UserRole,
  UserStatus,
} from '../src/generated/prisma/enums';

/**
 * TTW-084: a fresh deployment must price with the configured VAT rate before
 * any admin opens Settings, and a missing settings row must never price at 0%.
 *
 * The migration SQL is replayed against this database to model a fresh
 * deployment. The settings row that existed before the suite is restored
 * afterwards, because other suites share the database.
 */
const MIGRATION_SUFFIX = '_ttw084_default_site_settings';

function readDefaultSettingsMigration(): string {
  const migrationsDir = join(__dirname, '..', 'prisma', 'migrations');
  const dir = readdirSync(migrationsDir).find((name) =>
    name.endsWith(MIGRATION_SUFFIX),
  );
  if (!dir) {
    throw new Error(`No migration ending with ${MIGRATION_SUFFIX}`);
  }
  return readFileSync(join(migrationsDir, dir, 'migration.sql'), 'utf8');
}

describe('Default site settings (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let pricing: PricingService;
  let orders: OrdersService;
  let previousRow: Awaited<ReturnType<typeof readRow>>;
  const migrationSql = readDefaultSettingsMigration();

  function readRow() {
    return prisma.siteSettings.findUnique({ where: { id: 'default' } });
  }

  async function deleteRow() {
    await prisma.siteSettings.deleteMany({ where: { id: 'default' } });
  }

  beforeAll(async () => {
    app = await createE2eApp();
    prisma = app.get(PrismaService);
    pricing = app.get(PricingService);
    orders = app.get(OrdersService);
    previousRow = await readRow();
  });

  afterAll(async () => {
    await deleteRow();
    if (previousRow) {
      await prisma.siteSettings.create({ data: previousRow });
    }
    await closeE2eApp(app);
  });

  async function seedPurchasableVariant(suffix: string) {
    const passwordHash = await bcrypt.hash('TestPassword1!', 10);
    const customer = await prisma.user.create({
      data: {
        email: `vat-default-${suffix}@example.com`,
        passwordHash,
        role: UserRole.CUSTOMER,
        status: UserStatus.ACTIVE,
        emailVerifiedAt: new Date(),
        firstName: 'Vat',
        lastName: 'Default',
      },
    });
    const category = await prisma.category.create({
      data: { name: `Vat Cat ${suffix}`, slug: `vat-cat-${suffix}` },
    });
    const product = await prisma.product.create({
      data: {
        name: `Vat Product ${suffix}`,
        slug: `vat-product-${suffix}`,
        status: ProductStatus.ACTIVE,
        categoryId: category.id,
        prices: { create: { currency: CurrencyCode.NGN, amount: 5000 } },
      },
    });
    const variant = await prisma.productVariant.create({
      data: {
        productId: product.id,
        name: 'Default',
        sku: `SKU-VAT-${suffix}`,
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
      data: { name: `Vat Lagos ${suffix}`, isActive: true },
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
        addressLine1: '1 Vat Street',
        city: 'Ikeja',
        state: 'Lagos',
        stateCode: 'LA',
        countryCode: 'NG',
        country: 'Nigeria',
      },
    });
    return { customer, variant, address };
  }

  it('is recorded as applied by migrate deploy', async () => {
    const applied = await prisma.$queryRaw<
      { migration_name: string; finished_at: Date | null }[]
    >`SELECT migration_name, finished_at FROM _prisma_migrations
      WHERE migration_name LIKE ${'%' + MIGRATION_SUFFIX}
        AND rolled_back_at IS NULL`;
    expect(applied).toHaveLength(1);
    expect(applied[0].finished_at).not.toBeNull();
  });

  it('creates the default row with Nigerian VAT on a database without one', async () => {
    await deleteRow();

    await prisma.$executeRawUnsafe(migrationSql);

    const row = await readRow();
    expect(row).not.toBeNull();
    expect(Number(row!.vatRate)).toBe(0.075);
    expect(row!.pricesIncludeVat).toBe(true);
    expect(row!.vatAppliesToShipping).toBe(true);
    expect(row!.currency).toBe(CurrencyCode.NGN);
  });

  it('never overwrites settings an admin already saved', async () => {
    await deleteRow();
    await prisma.siteSettings.create({
      data: {
        id: 'default',
        vatRate: 0.1,
        pricesIncludeVat: false,
        vatAppliesToShipping: false,
        currency: CurrencyCode.NGN,
        payoutCadenceDays: 14,
      },
    });

    await prisma.$executeRawUnsafe(migrationSql);

    const row = await readRow();
    expect(Number(row!.vatRate)).toBe(0.1);
    expect(row!.pricesIncludeVat).toBe(false);
    expect(row!.vatAppliesToShipping).toBe(false);
    expect(row!.payoutCadenceDays).toBe(14);
  });

  it('quotes 7.5% VAT on a fresh deployment before anyone opens Settings', async () => {
    await deleteRow();
    await prisma.$executeRawUnsafe(migrationSql);
    const { customer, variant, address } = await seedPurchasableVariant(
      `fresh-${Date.now()}`,
    );

    const quote = await pricing.quoteStandard(customer.id, {
      shippingAddressId: address.id,
      items: [{ variantId: variant.id, quantity: 2 }],
    });

    // The shipping rate comes from whichever Lagos zone wins in the shared
    // database, so derive the expected VAT from the quoted shipping fee.
    // Inclusive VAT on goods and shipping: taxable * 0.075 / 1.075.
    const taxable = quote.subtotalAmount + quote.shippingFee;
    const expectedVat = Math.round(((taxable * 0.075) / 1.075) * 100) / 100;
    expect(quote.subtotalAmount).toBe(10000);
    expect(quote.vatRate).toBe(0.075);
    expect(quote.pricesIncludeVat).toBe(true);
    expect(quote.vatAppliesToShipping).toBe(true);
    expect(quote.vatAmount).toBeGreaterThan(0);
    expect(quote.vatAmount).toBe(expectedVat);
  });

  it('refuses to quote or create an order when the settings row is missing', async () => {
    const { customer, variant, address } = await seedPurchasableVariant(
      `missing-${Date.now()}`,
    );
    await deleteRow();

    await expect(
      pricing.quoteStandard(customer.id, {
        shippingAddressId: address.id,
        items: [{ variantId: variant.id, quantity: 1 }],
      }),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);

    await expect(
      orders.create(customer.id, {
        shippingAddressId: address.id,
        items: [{ variantId: variant.id, quantity: 1 }],
        idempotencyKey: `vat-missing-${Date.now()}`,
      }),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);

    expect(await prisma.order.count({ where: { userId: customer.id } })).toBe(
      0,
    );
  });
});
