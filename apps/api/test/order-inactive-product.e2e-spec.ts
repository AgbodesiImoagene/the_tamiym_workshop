import { INestApplication } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import request from 'supertest';
import { App } from 'supertest/types';
import { AuthService } from '../src/auth/auth.service';
import { InventoryLifecycleService } from '../src/inventory/inventory-lifecycle.service';
import { PricingService } from '../src/pricing/pricing.service';
import { PrismaService } from '../src/prisma/prisma.service';
import {
  AuthSurface,
  CampaignStatus,
  CurrencyCode,
  ModerationStatus,
  ProductStatus,
  ShippingRateProvider,
  ShippingRuleMatchType,
  UserRole,
  UserStatus,
} from '../src/generated/prisma/enums';
import { closeE2eApp, createE2eApp } from './utils/create-e2e-app';
import { ensureLga } from './utils/geo-fixtures';

const PASSWORD = 'TestPassword1!';
const INACTIVE = [ProductStatus.DRAFT, ProductStatus.ARCHIVED];
const PATHS = [
  'standard quote',
  'standard order',
  'campaign quote',
  'campaign order',
] as const;
type Path = (typeof PATHS)[number];

/**
 * TTW-275: only an ACTIVE product can be quoted or ordered, standard or campaign,
 * including when it leaves ACTIVE while the order is being created. Real Postgres,
 * real HTTP: the row lock cannot be proven with mocks.
 */
describe('Quotes and orders of a product that is not active (e2e, TTW-275)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let pricing: PricingService;
  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  let counter = 0;
  let token: string;
  let userId: string;
  let organizerId: string;
  let addressId: string;
  let categoryId: string;
  let previousTax: Awaited<ReturnType<typeof readTax>>;

  const readTax = () =>
    prisma.siteSettings.findUnique({
      where: { id: 'default' },
      select: {
        vatRate: true,
        pricesIncludeVat: true,
        vatAppliesToShipping: true,
        currency: true,
      },
    });

  beforeAll(async () => {
    app = await createE2eApp();
    prisma = app.get(PrismaService);
    pricing = app.get(PricingService);

    // VAT is pinned (seed:e2e writes 7.5% in the shared database); restored afterwards.
    previousTax = await readTax();
    const tax = {
      vatRate: 0,
      pricesIncludeVat: true,
      vatAppliesToShipping: true,
      currency: CurrencyCode.NGN,
    };
    await prisma.siteSettings.upsert({
      where: { id: 'default' },
      update: tax,
      create: { id: 'default', ...tax },
    });

    const createUser = async (role: UserRole, key: string) =>
      prisma.user.create({
        data: {
          email: `inactive-${key}-${stamp}@example.com`,
          passwordHash: await bcrypt.hash(PASSWORD, 10),
          role,
          status: UserStatus.ACTIVE,
          firstName: 'Inactive',
          lastName: 'Product',
          emailVerifiedAt: new Date(),
        },
      });
    const customer = await createUser(UserRole.CUSTOMER, 'customer');
    userId = customer.id;
    organizerId = (await createUser(UserRole.ORGANIZER, 'organizer')).id;
    const session = await app
      .get(AuthService)
      .login(
        { email: customer.email, password: PASSWORD },
        AuthSurface.CUSTOMER,
      );
    token = session.access_token;

    await prisma.geoState.upsert({
      where: { code: 'LA' },
      update: { isActive: true },
      create: { code: 'LA', name: 'Lagos', isActive: true },
    });
    const zone = await prisma.shippingZone.create({
      data: { name: `Inactive Lagos ${stamp}`, isActive: true },
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
    addressId = (
      await prisma.address.create({
        data: {
          userId,
          addressLine1: '1 Inactive Street',
          city: 'Ikeja',
          state: 'Lagos',
          stateCode: 'LA',
          lgaId: (await ensureLga(prisma)).id,
          countryCode: 'NG',
          country: 'Nigeria',
        },
      })
    ).id;
    categoryId = (
      await prisma.category.create({
        data: { name: `Inactive ${stamp}`, slug: `inactive-${stamp}` },
      })
    ).id;
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  afterAll(async () => {
    if (previousTax) {
      await prisma.siteSettings.update({
        where: { id: 'default' },
        data: previousTax,
      });
    } else {
      await prisma.siteSettings.delete({ where: { id: 'default' } });
    }
    await closeE2eApp(app);
  });

  async function createProduct(status: ProductStatus = ProductStatus.ACTIVE) {
    counter += 1;
    const key = `${stamp}-${counter}`;
    const product = await prisma.product.create({
      data: {
        name: `Inactive Product ${key}`,
        slug: `inactive-product-${key}`,
        status,
        categoryId,
        prices: { create: { currency: CurrencyCode.NGN, amount: 5000 } },
      },
    });
    const variant = await prisma.productVariant.create({
      data: { productId: product.id, name: 'Default', sku: `SKU-INA-${key}` },
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
    return { productId: product.id, variantId: variant.id };
  }

  async function createCampaign(productIds: string[]) {
    counter += 1;
    const key = `${stamp}-${counter}`;
    return prisma.campaign.create({
      data: {
        organizerId,
        title: `Inactive Campaign ${key}`,
        slug: `inactive-campaign-${key}`,
        status: CampaignStatus.ACTIVE,
        moderationStatus: ModerationStatus.APPROVED,
        endDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        products: {
          create: productIds.map((productId) => ({
            productId,
            prices: { create: { currency: CurrencyCode.NGN, amount: 8000 } },
          })),
        },
      },
    });
  }

  const setStatus = (productId: string, status: ProductStatus) =>
    prisma.product.update({ where: { id: productId }, data: { status } });

  function send(
    path: Path,
    campaignId: string,
    variantIds: string[],
    idempotencyKey?: string,
  ) {
    const base = path.startsWith('campaign')
      ? `/v1/campaigns/${campaignId}/orders`
      : '/v1/orders';
    return request(app.getHttpServer())
      .post(path.endsWith('quote') ? `${base}/quote` : base)
      .set('Authorization', `Bearer ${token}`)
      .send({
        shippingAddressId: addressId,
        items: variantIds.map((variantId) => ({ variantId, quantity: 1 })),
        ...(idempotencyKey ? { idempotencyKey } : {}),
      });
  }

  /** Nothing about the variant was written: no order line and no reserved unit. */
  async function expectNothingStored(variantId: string) {
    const [lines, inventory] = await Promise.all([
      prisma.orderItem.count({ where: { variantId } }),
      prisma.inventoryItem.findUniqueOrThrow({ where: { variantId } }),
    ]);
    expect(lines).toBe(0);
    expect(inventory.reserved).toBe(0);
  }

  /**
   * True as soon as a statement like `pattern` waits for a database lock; false if
   * `settled` becomes true first.
   */
  async function waitsOnLock(pattern: string, settled: () => boolean) {
    while (!settled()) {
      const [{ waiting }] = await prisma.$queryRaw<[{ waiting: number }]>`
        SELECT count(*)::int AS waiting FROM pg_stat_activity
        WHERE datname = current_database()
          AND wait_event_type = 'Lock'
          AND query LIKE ${pattern}
          AND pid <> pg_backend_pid()`;
      if (waiting > 0) return true;
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
    return false;
  }

  function expectRefused(res: request.Response, variantId: string) {
    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({
      code: 'PRODUCT_NOT_AVAILABLE',
      message: `Variant ${variantId} is not available`,
    });
  }

  describe.each(PATHS)('%s', (path) => {
    it.each(INACTIVE)('refuses a %s product', async (status) => {
      const { productId, variantId } = await createProduct();
      const campaign = await createCampaign([productId]);
      await setStatus(productId, status);

      const res = await send(path, campaign.id, [variantId]);

      expectRefused(res, variantId);
      await expectNothingStored(variantId);
    });

    it('accepts an ACTIVE product', async () => {
      const { productId, variantId } = await createProduct();
      const campaign = await createCampaign([productId]);

      const res = await send(path, campaign.id, [variantId]);

      expect(res.status).toBe(path.endsWith('quote') ? 200 : 201);
    });
  });

  it.each(PATHS)(
    'refuses the whole cart of a %s when one line is archived',
    async (path) => {
      const active = await createProduct();
      const archived = await createProduct();
      const campaign = await createCampaign([
        active.productId,
        archived.productId,
      ]);
      await setStatus(archived.productId, ProductStatus.ARCHIVED);

      const res = await send(path, campaign.id, [
        active.variantId,
        archived.variantId,
      ]);

      expectRefused(res, archived.variantId);
      await expectNothingStored(active.variantId);
      await expectNothingStored(archived.variantId);
    },
  );

  describe.each(['standard order', 'campaign order'] as const)(
    'while a %s exists or is being created',
    (path) => {
      it('returns the original order on a retry after the product was archived', async () => {
        const { productId, variantId } = await createProduct();
        const campaign = await createCampaign([productId]);
        const key = `retry-${stamp}-${(counter += 1)}`;
        const first = await send(path, campaign.id, [variantId], key);
        expect(first.status).toBe(201);
        await setStatus(productId, ProductStatus.ARCHIVED);

        const retry = await send(path, campaign.id, [variantId], key);

        expect(retry.status).toBe(201);
        expect(retry.body.id).toBe(first.body.id);
        expect(await prisma.orderItem.count({ where: { variantId } })).toBe(1);
        const inventory = await prisma.inventoryItem.findUniqueOrThrow({
          where: { variantId },
        });
        expect(inventory.reserved).toBe(1);
      });

      it('refuses a product archived between the quote and the order transaction', async () => {
        const { productId, variantId } = await createProduct();
        const campaign = await createCampaign([productId]);
        const archive = () => setStatus(productId, ProductStatus.ARCHIVED);
        // The real quote runs while the product is active; the archive lands right after.
        if (path === 'standard order') {
          const quote = pricing.quoteStandard.bind(pricing);
          jest
            .spyOn(pricing, 'quoteStandard')
            .mockImplementationOnce(async (...args) => {
              const result = await quote(...args);
              await archive();
              return result;
            });
        } else {
          const quote = pricing.quoteCampaign.bind(pricing);
          jest
            .spyOn(pricing, 'quoteCampaign')
            .mockImplementationOnce(async (...args) => {
              const result = await quote(...args);
              await archive();
              return result;
            });
        }

        const res = await send(path, campaign.id, [variantId]);

        expectRefused(res, variantId);
        await expectNothingStored(variantId);
      });

      it('waits for an uncommitted archive, then refuses the order', async () => {
        const { productId, variantId } = await createProduct();
        const campaign = await createCampaign([productId]);
        let commit!: () => void;
        const mayCommit = new Promise<void>((resolve) => (commit = resolve));
        let written!: () => void;
        const hasWritten = new Promise<void>((resolve) => (written = resolve));
        // A second connection archives the product and holds its transaction open.
        const archiving = prisma.$transaction(
          async (tx) => {
            await tx.product.update({
              where: { id: productId },
              data: { status: ProductStatus.ARCHIVED },
            });
            written();
            await mayCommit;
          },
          { maxWait: 30_000, timeout: 60_000 },
        );
        await hasWritten;

        let answered = false;
        const pending = send(path, campaign.id, [variantId]).then((res) => {
          answered = true;
          return res;
        });
        const waitedOnLock = await waitsOnLock(
          '%FOR SHARE OF%',
          () => answered,
        );
        commit();
        await archiving;
        const res = await pending;

        expectRefused(res, variantId);
        expect(waitedOnLock).toBe(true);
        await expectNothingStored(variantId);
      });

      it('holds the lock until the order commits, so an archive waits for it', async () => {
        const { productId, variantId } = await createProduct();
        const campaign = await createCampaign([productId]);
        const lifecycle = app.get(InventoryLifecycleService);
        let release!: () => void;
        const mayCommit = new Promise<void>((resolve) => (release = resolve));
        let paused!: () => void;
        const isPaused = new Promise<void>((resolve) => (paused = resolve));
        // The order's transaction is held open after its last stock write.
        const reserve = lifecycle.reserveOrderItems.bind(lifecycle);
        jest
          .spyOn(lifecycle, 'reserveOrderItems')
          .mockImplementationOnce(async (...args) => {
            await reserve(...args);
            paused();
            await mayCommit;
          });

        const pending = send(path, campaign.id, [variantId]).then((res) => res);
        await Promise.race([isPaused, pending]);
        let archived = false;
        const archiving = setStatus(productId, ProductStatus.ARCHIVED).then(
          () => {
            archived = true;
          },
        );
        const waitedOnLock = await waitsOnLock(
          'UPDATE%products%',
          () => archived,
        );
        const archivedBeforeCommit = archived;
        release();
        const res = await pending;
        await archiving;

        expect(res.status).toBe(201);
        expect(archivedBeforeCommit).toBe(false);
        expect(waitedOnLock).toBe(true);
        const [product, inventory] = await Promise.all([
          prisma.product.findUniqueOrThrow({ where: { id: productId } }),
          prisma.inventoryItem.findUniqueOrThrow({ where: { variantId } }),
        ]);
        expect(product.status).toBe(ProductStatus.ARCHIVED);
        expect(inventory.reserved).toBe(1);
      });
    },
  );
});
