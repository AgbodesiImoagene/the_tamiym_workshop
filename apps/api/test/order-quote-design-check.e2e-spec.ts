import { INestApplication } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import request from 'supertest';
import { App } from 'supertest/types';
import { AuthService } from '../src/auth/auth.service';
import { PrismaService } from '../src/prisma/prisma.service';
import {
  AuthSurface,
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
const BACK_SURCHARGE = 750;

/**
 * TTW-239: `POST /v1/orders/quote` applies the same design rule as order creation:
 * the design must exist, belong to the caller, match the variant's product and not be
 * REJECTED. Real Postgres, real HTTP, so the whole route is covered.
 */
describe('Order quote design check (e2e, TTW-239)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let authService: AuthService;
  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  let counter = 0;
  let productId: string;
  let otherProductId: string;
  let variantId: string;
  let otherVariantId: string;
  let backViewId: string;
  let frontViewId: string;
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
    authService = app.get(AuthService);

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

    const category = await prisma.category.create({
      data: { name: `Quote Chk Cat ${stamp}`, slug: `quote-chk-cat-${stamp}` },
    });
    const mkProduct = async (key: string) => {
      const product = await prisma.product.create({
        data: {
          name: `Quote Chk ${key} ${stamp}`,
          slug: `quote-chk-${key}-${stamp}`,
          status: ProductStatus.ACTIVE,
          categoryId: category.id,
          prices: { create: { currency: CurrencyCode.NGN, amount: 5000 } },
        },
      });
      const variant = await prisma.productVariant.create({
        data: {
          productId: product.id,
          name: 'Default',
          sku: `SKU-QCHK-${key}-${stamp}`,
        },
      });
      return { product, variant };
    };
    const main = await mkProduct('main');
    const other = await mkProduct('other');
    productId = main.product.id;
    variantId = main.variant.id;
    otherProductId = other.product.id;
    otherVariantId = other.variant.id;

    const front = await prisma.productView.create({
      data: { productId, key: 'front', displayName: 'Front', sortOrder: 0 },
    });
    const back = await prisma.productView.create({
      data: { productId, key: 'back', displayName: 'Back', sortOrder: 1 },
    });
    frontViewId = front.id;
    backViewId = back.id;
    await prisma.productViewPricing.create({
      data: {
        productId,
        productViewId: back.id,
        currency: CurrencyCode.NGN,
        surchargeAmount: BACK_SURCHARGE,
      },
    });
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

  async function createCustomer() {
    counter += 1;
    const user = await prisma.user.create({
      data: {
        email: `quote-chk-${stamp}-${counter}@example.com`,
        passwordHash: await bcrypt.hash(PASSWORD, 10),
        role: UserRole.CUSTOMER,
        status: UserStatus.ACTIVE,
        firstName: 'Quote',
        lastName: 'Check',
        emailVerifiedAt: new Date(),
      },
    });
    const session = await authService.login(
      { email: user.email, password: PASSWORD },
      AuthSurface.CUSTOMER,
    );
    await prisma.geoState.upsert({
      where: { code: 'LA' },
      update: { isActive: true },
      create: { code: 'LA', name: 'Lagos', isActive: true },
    });
    const address = await prisma.address.create({
      data: {
        userId: user.id,
        addressLine1: '1 Quote Street',
        city: 'Ikeja',
        state: 'Lagos',
        stateCode: 'LA',
        lgaId: (await ensureLga(prisma)).id,
        countryCode: 'NG',
        country: 'Nigeria',
      },
    });
    return { user, address, token: session.access_token };
  }

  async function createShippingForLagos() {
    const zone = await prisma.shippingZone.create({
      data: { name: `Quote Chk Lagos ${stamp}`, isActive: true },
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
  }

  /** A design that uses the front and the back views of the main product. */
  async function createDesign(
    userId: string,
    moderationStatus: ModerationStatus,
    forProductId = productId,
  ) {
    return prisma.design.create({
      data: {
        userId,
        productId: forProductId,
        name: 'Quote check design',
        designData: {},
        moderationStatus,
        views: {
          create: [
            { productViewId: frontViewId, isUsed: true, layerCount: 1 },
            { productViewId: backViewId, isUsed: true, layerCount: 1 },
          ],
        },
      },
    });
  }

  const quote = (
    token: string,
    addressId: string,
    item: { variantId: string; designId?: string },
  ) =>
    request(app.getHttpServer())
      .post('/v1/orders/quote')
      .set('Authorization', `Bearer ${token}`)
      .send({
        shippingAddressId: addressId,
        items: [{ ...item, quantity: 1 }],
      });

  let owner: Awaited<ReturnType<typeof createCustomer>>;
  let stranger: Awaited<ReturnType<typeof createCustomer>>;

  beforeAll(async () => {
    await createShippingForLagos();
    owner = await createCustomer();
    stranger = await createCustomer();
  });

  it("refuses another customer's design with 403 and no surcharge in the answer", async () => {
    const design = await createDesign(owner.user.id, ModerationStatus.APPROVED);
    const res = await quote(stranger.token, stranger.address.id, {
      variantId,
      designId: design.id,
    });
    expect(res.status).toBe(403);
    expect(JSON.stringify(res.body)).not.toContain(String(BACK_SURCHARGE));
  });

  it('refuses a design that does not exist with 400', async () => {
    const res = await quote(owner.token, owner.address.id, {
      variantId,
      designId: 'cl_no_such_design',
    });
    expect(res.status).toBe(400);
  });

  it('refuses a design of another product with 400', async () => {
    const design = await createDesign(
      owner.user.id,
      ModerationStatus.APPROVED,
      otherProductId,
    );
    const res = await quote(owner.token, owner.address.id, {
      variantId,
      designId: design.id,
    });
    expect(res.status).toBe(400);
    // The other product's own variant is quotable with that design.
    const ok = await quote(owner.token, owner.address.id, {
      variantId: otherVariantId,
      designId: design.id,
    });
    expect(ok.status).toBe(200);
  });

  it('refuses a REJECTED design with 400 and code DESIGN_REJECTED', async () => {
    const design = await createDesign(owner.user.id, ModerationStatus.REJECTED);
    const res = await quote(owner.token, owner.address.id, {
      variantId,
      designId: design.id,
    });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('DESIGN_REJECTED');
  });

  it.each([
    ModerationStatus.PENDING,
    ModerationStatus.FLAGGED,
    ModerationStatus.APPROVED,
  ])('quotes a %s design with its view surcharge (Q28)', async (status) => {
    const design = await createDesign(owner.user.id, status);
    const res = await quote(owner.token, owner.address.id, {
      variantId,
      designId: design.id,
    });
    expect(res.status).toBe(200);
    expect(res.body.items[0].unitViewSurcharge).toBe(BACK_SURCHARGE);
    expect(res.body.items[0].unitFinalPrice).toBe(5000 + BACK_SURCHARGE);
  });

  it('quotes a line without a design as before', async () => {
    const res = await quote(owner.token, owner.address.id, { variantId });
    expect(res.status).toBe(200);
    expect(res.body.items[0].unitViewSurcharge).toBe(0);
    expect(res.body.items[0].unitFinalPrice).toBe(5000);
  });
});
