import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import * as bcrypt from 'bcrypt';
import { closeE2eApp, createE2eApp } from './utils/create-e2e-app';
import { generateTotpCode } from '../src/auth/admin-mfa.totp';
import { AuthService, isMfaChallengeResponse } from '../src/auth/auth.service';
import { OrdersService } from '../src/orders/orders.service';
import { PrismaService } from '../src/prisma/prisma.service';
import { ensureLga } from './utils/geo-fixtures';
import {
  AuthSurface,
  CurrencyCode,
  MediaAssetStatus,
  MediaSourceType,
  MediaVisibility,
  ModerationStatus,
  ProductStatus,
  ShippingRateProvider,
  ShippingRuleMatchType,
  UserRole,
  UserStatus,
  VirusScanStatus,
} from '../src/generated/prisma/enums';

const PASSWORD = 'TestPassword1!';

/**
 * TTW-101: the print shop reads what to print from the admin order. The design is frozen
 * on the order item when the order is placed, so a later edit of the design never changes
 * it, and only admins can read it. Real Postgres, production AppModule wiring.
 */
describe('Order print files (e2e)', () => {
  const suffix = `${Date.now()}`;
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let orders: OrdersService;
  let adminAuth: string;
  let customerAuth: string;

  const userIds: string[] = [];
  const productIds: string[] = [];
  const categoryIds: string[] = [];
  const zoneIds: string[] = [];
  const mediaIds: string[] = [];

  async function makeUser(role: UserRole, label: string) {
    const email = `print-${label}-${suffix}@example.com`;
    const user = await prisma.user.create({
      data: {
        email,
        passwordHash: await bcrypt.hash(PASSWORD, 10),
        role,
        status: UserStatus.ACTIVE,
        emailVerifiedAt: new Date(),
        firstName: 'Print',
        lastName: label,
      },
    });
    userIds.push(user.id);
    return { user, email };
  }

  beforeAll(async () => {
    app = await createE2eApp();
    prisma = app.get(PrismaService);
    orders = app.get(OrdersService);
    const authService = app.get(AuthService);

    const admin = await makeUser(UserRole.ADMIN, 'admin');
    const challenge = await authService.login(
      { email: admin.email, password: PASSWORD },
      AuthSurface.ADMIN,
    );
    if (!isMfaChallengeResponse(challenge)) {
      throw new Error('expected MFA enrollment challenge');
    }
    const enrollment = await authService.adminMfaEnrollStart(
      challenge.mfa_token,
    );
    const session = await authService.adminMfaEnrollConfirm(
      challenge.mfa_token,
      generateTotpCode(enrollment.secret),
    );
    adminAuth = `Bearer ${session.access_token}`;

    const other = await makeUser(UserRole.CUSTOMER, 'other');
    const login = await authService.login(
      { email: other.email, password: PASSWORD },
      AuthSurface.CUSTOMER,
    );
    if (isMfaChallengeResponse(login)) {
      throw new Error('customer must not need MFA');
    }
    customerAuth = `Bearer ${login.access_token}`;
  });

  afterAll(async () => {
    const variants = await prisma.productVariant.findMany({
      where: { productId: { in: productIds } },
      select: { id: true },
    });
    await prisma.inventoryMovement.deleteMany({
      where: { variantId: { in: variants.map((v) => v.id) } },
    });
    await prisma.order.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.design.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.designAsset.deleteMany({
      where: { ownerUserId: { in: userIds } },
    });
    await prisma.mediaAsset.deleteMany({ where: { id: { in: mediaIds } } });
    await prisma.product.deleteMany({ where: { id: { in: productIds } } });
    await prisma.category.deleteMany({ where: { id: { in: categoryIds } } });
    await prisma.shippingZone.deleteMany({ where: { id: { in: zoneIds } } });
    await prisma.authSession.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.address.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    await closeE2eApp(app);
  });

  /** Product with a front view (with a print area) and a back view, one variant, shipping. */
  async function seed(label: string) {
    const customer = await makeUser(UserRole.CUSTOMER, `buyer-${label}`);
    const category = await prisma.category.create({
      data: {
        name: `Print Cat ${label} ${suffix}`,
        slug: `print-cat-${label}-${suffix}`,
      },
    });
    categoryIds.push(category.id);
    const product = await prisma.product.create({
      data: {
        name: `Print Product ${label}`,
        slug: `print-product-${label}-${suffix}`,
        status: ProductStatus.ACTIVE,
        categoryId: category.id,
        prices: { create: { currency: CurrencyCode.NGN, amount: 5000 } },
      },
    });
    productIds.push(product.id);
    const front = await prisma.productView.create({
      data: {
        productId: product.id,
        key: 'front',
        displayName: 'Front',
        sortOrder: 0,
      },
    });
    const back = await prisma.productView.create({
      data: {
        productId: product.id,
        key: 'back',
        displayName: 'Back',
        sortOrder: 1,
      },
    });
    await prisma.printArea.create({
      data: {
        productId: product.id,
        productViewId: front.id,
        x: 0.2,
        y: 0.25,
        width: 0.6,
        height: 0.5,
      },
    });
    const variant = await prisma.productVariant.create({
      data: {
        productId: product.id,
        name: 'M',
        sku: `SKU-PRINT-${label}-${suffix}`,
      },
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
    await prisma.geoState.upsert({
      where: { code: 'LA' },
      update: { isActive: true },
      create: { code: 'LA', name: 'Lagos', isActive: true },
    });
    const zone = await prisma.shippingZone.create({
      data: { name: `Print Lagos ${label} ${suffix}`, isActive: true },
    });
    zoneIds.push(zone.id);
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
        userId: customer.user.id,
        addressLine1: '1 Print Street',
        city: 'Ikeja',
        state: 'Lagos',
        stateCode: 'LA',
        lgaId: (await ensureLga(prisma)).id,
        countryCode: 'NG',
        country: 'Nigeria',
      },
    });
    const media = await prisma.mediaAsset.create({
      data: {
        sourceType: MediaSourceType.UPLOAD,
        status: MediaAssetStatus.READY,
        scanStatus: VirusScanStatus.CLEAN,
        moderationStatus: ModerationStatus.APPROVED,
        visibility: MediaVisibility.PRIVATE,
        originalKey: `media/print-${label}-${suffix}/original.png`,
        originalMime: 'image/png',
        originalBytes: 123456,
        originalWidth: 3000,
        originalHeight: 2000,
      },
    });
    mediaIds.push(media.id);
    const designAsset = await prisma.designAsset.create({
      data: { ownerUserId: customer.user.id, mediaAssetId: media.id },
    });
    return { customer, product, front, back, variant, address, designAsset };
  }

  const imageLayer = (assetId: string) => ({
    type: 'Image',
    left: 10,
    top: 20,
    width: 400,
    height: 300,
    scaleX: 0.5,
    scaleY: 0.5,
    angle: 0,
    data: { designAssetId: assetId },
  });
  const textLayer = (text: string) => ({
    type: 'Textbox',
    text,
    fontFamily: 'Inter',
    fontSize: 40,
    fill: '#112233',
    left: 50,
    top: 60,
    width: 200,
    height: 48,
    scaleX: 1,
    scaleY: 1,
    angle: 0,
  });

  async function orderTwoSidedDesign(label: string) {
    const s = await seed(label);
    const design = await prisma.design.create({
      data: {
        userId: s.customer.user.id,
        productId: s.product.id,
        name: 'Original name',
        moderationStatus: ModerationStatus.APPROVED,
        designData: {
          version: 1,
          productId: s.product.id,
          views: {
            front: {
              productViewId: s.front.id,
              isUsed: true,
              layerCount: 2,
              fabricJson: {
                objects: [
                  imageLayer(s.designAsset.id),
                  textLayer('Original text'),
                ],
              },
            },
            back: {
              productViewId: s.back.id,
              isUsed: true,
              layerCount: 1,
              fabricJson: { objects: [textLayer('Back text')] },
            },
          },
        },
      },
    });
    const order = await orders.create(s.customer.user.id, {
      shippingAddressId: s.address.id,
      items: [{ variantId: s.variant.id, designId: design.id, quantity: 1 }],
    });
    return { ...s, design, order };
  }

  it('freezes the design on the order item when the order is placed', async () => {
    const s = await orderTwoSidedDesign('freeze');

    const item = await prisma.orderItem.findFirstOrThrow({
      where: { orderId: s.order.id },
    });
    const snapshot = item.designSnapshot as {
      version: number;
      designName: string;
      views: Array<{
        key: string;
        printArea: unknown;
        layers: Array<{ kind: string }>;
      }>;
    };
    expect(snapshot.version).toBe(1);
    expect(snapshot.designName).toBe('Original name');
    expect(snapshot.views.map((v) => v.key)).toEqual(['front', 'back']);
    expect(snapshot.views[0].printArea).toEqual({
      x: 0.2,
      y: 0.25,
      width: 0.6,
      height: 0.5,
    });
    expect(snapshot.views[0].layers.map((l) => l.kind)).toEqual([
      'image',
      'text',
    ]);
  });

  it('keeps the item without a design at null', async () => {
    const s = await seed('nodesign');
    const order = await orders.create(s.customer.user.id, {
      shippingAddressId: s.address.id,
      items: [{ variantId: s.variant.id, quantity: 1 }],
    });
    const item = await prisma.orderItem.findFirstOrThrow({
      where: { orderId: order.id },
    });
    expect(item.designSnapshot).toBeNull();
  });

  it('does not change what the order prints when the design is edited afterwards', async () => {
    const s = await orderTwoSidedDesign('edit');

    await prisma.design.update({
      where: { id: s.design.id },
      data: {
        name: 'Renamed after ordering',
        designData: {
          version: 1,
          productId: s.product.id,
          views: {
            front: {
              productViewId: s.front.id,
              fabricJson: { objects: [textLayer('Edited after ordering')] },
            },
          },
        },
      },
    });

    const res = await request(app.getHttpServer())
      .get(`/v1/admin/orders/${s.order.id}`)
      .set('Authorization', adminAuth)
      .expect(200);

    const body = JSON.stringify(res.body.items[0].printFiles);
    expect(body).toContain('Original text');
    expect(body).toContain('Back text');
    expect(body).toContain('Original name');
    expect(body).not.toContain('Edited after ordering');
    expect(body).not.toContain('Renamed after ordering');
  });

  it('gives an admin the sides, positions, print areas and original files', async () => {
    const s = await orderTwoSidedDesign('admin');

    const res = await request(app.getHttpServer())
      .get(`/v1/admin/orders/${s.order.id}`)
      .set('Authorization', adminAuth)
      .expect(200);

    const printFiles = res.body.items[0].printFiles;
    expect(printFiles.designName).toBe('Original name');
    expect(printFiles.views.map((v: { key: string }) => v.key)).toEqual([
      'front',
      'back',
    ]);
    expect(printFiles.views[0].printArea).toEqual({
      x: 0.2,
      y: 0.25,
      width: 0.6,
      height: 0.5,
    });
    const image = printFiles.views[0].layers[0];
    expect(image).toMatchObject({
      kind: 'image',
      designAssetId: s.designAsset.id,
      left: 10,
      top: 20,
      scaleX: 0.5,
      previewPath: `/design-assets/${s.designAsset.id}/file?variant=display`,
      originalLinkPath: `/design-assets/${s.designAsset.id}/link?variant=original`,
      file: { mimeType: 'image/png', bytes: 123456, width: 3000, height: 2000 },
    });
    // Nothing from the storage leaks into the order response.
    expect(JSON.stringify(res.body)).not.toContain('originalKey');
    expect(JSON.stringify(res.body)).not.toContain('media/print-');
  });

  it('says nothing about print files on an order without a design', async () => {
    const s = await seed('plain');
    const order = await orders.create(s.customer.user.id, {
      shippingAddressId: s.address.id,
      items: [{ variantId: s.variant.id, quantity: 1 }],
    });
    const res = await request(app.getHttpServer())
      .get(`/v1/admin/orders/${order.id}`)
      .set('Authorization', adminAuth)
      .expect(200);
    expect(res.body.items[0].printFiles).toBeNull();
  });

  it('refuses a customer and an anonymous caller', async () => {
    const s = await orderTwoSidedDesign('access');

    await request(app.getHttpServer())
      .get(`/v1/admin/orders/${s.order.id}`)
      .set('Authorization', customerAuth)
      .expect(403);
    await request(app.getHttpServer())
      .get(`/v1/admin/orders/${s.order.id}`)
      .expect(401);
  });

  it('never exposes the frozen design to the customer order routes', async () => {
    const s = await orderTwoSidedDesign('mine');
    const shapes = {
      create: s.order,
      detail: await orders.findOne(s.customer.user.id, s.order.id),
      list: await orders.findAll(s.customer.user.id),
    };
    for (const [route, shape] of Object.entries(shapes)) {
      const serialised = JSON.stringify(shape);
      expect({ route, leaks: serialised.includes('designSnapshot') }).toEqual({
        route,
        leaks: false,
      });
      expect({ route, leaks: serialised.includes('printFiles') }).toEqual({
        route,
        leaks: false,
      });
      expect({ route, leaks: serialised.includes('Original text') }).toEqual({
        route,
        leaks: false,
      });
    }
  });
});
