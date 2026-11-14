import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import {
  closePrismaScriptContext,
  createPrismaScriptContext,
  type PrismaScriptContext,
} from '../scripts/_prisma-script-client';

/**
 * TTW-212: rows with a generated id that point at an `e2e-` user or product
 * (campaign, payout, organiser application, privacy request, campaign
 * product, design) have Restrict foreign keys, so `seed:e2e` must delete
 * them before it deletes the fixture user or product. Same rows tied to a
 * non-fixture user must survive.
 *
 * The real script runs as a child process (it executes on import).
 */
describe('seed:e2e rows tied to fixture users and products (e2e)', () => {
  jest.setTimeout(400_000);

  const apiRoot = join(__dirname, '..');
  const marker = 'ttw212';
  const control = {
    user: `${marker}-control-user`,
    campaign: `${marker}-control-campaign`,
    payoutRef: `${marker}-control-payout`,
  };
  const fixtureCampaignSlug = `${marker}-fixture-campaign`;
  const fixturePayoutRef = `${marker}-fixture-payout`;
  const designName = `${marker}-design`;
  const limits = {
    user: `${marker}-limits-user`,
    category: `${marker}-limits-category`,
    product: `${marker}-limits-product`,
    address: `${marker}-limits-address`,
  };
  const more = {
    user: `${marker}-more-user`,
    address: `${marker}-more-address`,
    fixtureUserAddress: `${marker}-more-fixture-user-address`,
    category: `${marker}-more-category`,
  };
  const categoryProductSlug = `${marker}-product-in-fixture-category`;
  const categoryMovementKey = `${marker}:category-movement`;
  let context: PrismaScriptContext;
  let previousSettings: Awaited<ReturnType<typeof readSettings>>;

  function readSettings() {
    return context.prisma.siteSettings.findUnique({ where: { id: 'default' } });
  }

  function runSeed() {
    execFileSync(
      process.execPath,
      [
        '-r',
        'ts-node/register',
        '-r',
        'tsconfig-paths/register',
        'scripts/seed-e2e-dummy-data.ts',
      ],
      { cwd: apiRoot, env: process.env, stdio: 'pipe', timeout: 150_000 },
    );
  }

  async function removeTestRows() {
    const { prisma } = context;
    // Children first; every row of this spec carries the marker.
    await prisma.order.deleteMany({
      where: { userId: { in: [limits.user, more.user] } },
    });
    await prisma.campaignProduct.deleteMany({
      where: {
        OR: [
          { campaign: { slug: { startsWith: marker } } },
          { product: { slug: { startsWith: marker } } },
        ],
      },
    });
    await prisma.inventoryMovement.deleteMany({
      where: { effectKey: { startsWith: `${marker}:` } },
    });
    await prisma.design.deleteMany({ where: { name: { startsWith: marker } } });
    await prisma.productVariant.deleteMany({
      where: { sku: { startsWith: marker.toUpperCase() } },
    });
    // Payouts go with their campaign (cascade).
    await prisma.campaign.deleteMany({
      where: { slug: { startsWith: marker } },
    });
    await prisma.product.deleteMany({
      where: { slug: { startsWith: marker } },
    });
    await prisma.organizerApplication.deleteMany({
      where: { policyVersion: marker },
    });
    await prisma.privacyRequest.deleteMany({
      where: { policyVersion: marker },
    });
    await prisma.address.deleteMany({
      where: { id: { startsWith: `${marker}-` } },
    });
    await prisma.category.deleteMany({
      where: { id: { startsWith: `${marker}-` } },
    });
    await prisma.user.deleteMany({
      where: { id: { in: [control.user, limits.user, more.user] } },
    });
  }

  beforeAll(async () => {
    context = createPrismaScriptContext();
    previousSettings = await readSettings();
    await removeTestRows();
  });

  afterAll(async () => {
    await removeTestRows();
    // The seed rewrites the default settings row; other suites share it.
    await context.prisma.siteSettings.deleteMany({ where: { id: 'default' } });
    if (previousSettings) {
      await context.prisma.siteSettings.create({ data: previousSettings });
    }
    await closePrismaScriptContext(context);
  });

  it('deletes them with the fixture user or product and keeps the controls', async () => {
    const { prisma } = context;
    runSeed();

    const fixtureProduct = await prisma.product.findFirstOrThrow({
      where: { id: { startsWith: 'e2e-' } },
      orderBy: { id: 'asc' },
    });
    await prisma.user.create({
      data: {
        id: control.user,
        email: `${marker}-control@example.test`,
        firstName: 'Control',
        lastName: 'User',
      },
    });
    const controlCampaign = await prisma.campaign.create({
      data: {
        id: control.campaign,
        organizerId: control.user,
        title: 'TTW-212 control',
        slug: control.campaign,
      },
    });
    await prisma.campaign.create({
      data: {
        organizerId: 'e2e-user-organizer',
        title: 'TTW-212 fixture organiser',
        slug: fixtureCampaignSlug,
      },
    });
    await prisma.payout.create({
      data: {
        campaignId: controlCampaign.id,
        recipientUserId: control.user,
        providerRef: control.payoutRef,
        amount: '1.00',
      },
    });
    await prisma.payout.create({
      data: {
        campaignId: controlCampaign.id,
        recipientUserId: 'e2e-user-customer',
        providerRef: fixturePayoutRef,
        amount: '1.00',
      },
    });
    await prisma.organizerApplication.create({
      data: {
        userId: 'e2e-user-customer',
        organisationName: 'TTW-212',
        intendedUse: 'TTW-212',
        termsVersion: marker,
        termsAcceptedAt: new Date(),
        policyVersion: marker,
      },
    });
    await prisma.privacyRequest.create({
      data: {
        userId: 'e2e-user-customer',
        type: 'EXPORT',
        policyVersion: marker,
      },
    });
    await prisma.campaignProduct.create({
      data: { campaignId: controlCampaign.id, productId: fixtureProduct.id },
    });
    await prisma.design.create({
      data: {
        userId: control.user,
        productId: fixtureProduct.id,
        name: designName,
        designData: {},
      },
    });

    // Second run on the same database: none of these rows may block it.
    runSeed();

    const count = {
      fixtureCampaign: await prisma.campaign.count({
        where: { slug: fixtureCampaignSlug },
      }),
      fixturePayout: await prisma.payout.count({
        where: { providerRef: fixturePayoutRef },
      }),
      application: await prisma.organizerApplication.count({
        where: { policyVersion: marker },
      }),
      privacy: await prisma.privacyRequest.count({
        where: { policyVersion: marker },
      }),
      campaignProduct: await prisma.campaignProduct.count({
        where: { campaignId: controlCampaign.id },
      }),
      design: await prisma.design.count({ where: { name: designName } }),
      controlCampaign: await prisma.campaign.count({
        where: { id: control.campaign },
      }),
      controlPayout: await prisma.payout.count({
        where: { providerRef: control.payoutRef },
      }),
      controlUser: await prisma.user.count({ where: { id: control.user } }),
    };
    expect(count).toEqual({
      fixtureCampaign: 0,
      fixturePayout: 0,
      application: 0,
      privacy: 0,
      campaignProduct: 0,
      design: 0,
      controlCampaign: 1,
      controlPayout: 1,
      controlUser: 1,
    });
  });

  it('deletes a non-fixture product placed in a fixture category, with its variants and movements', async () => {
    const { prisma } = context;
    runSeed();

    const fixtureProduct = await prisma.product.findFirstOrThrow({
      where: { id: { startsWith: 'e2e-' } },
      orderBy: { id: 'asc' },
    });
    const product = await prisma.product.create({
      data: {
        categoryId: fixtureProduct.categoryId,
        name: 'TTW-212 product in a fixture category',
        slug: categoryProductSlug,
        variants: {
          create: {
            name: 'TTW-212 variant',
            sku: `${marker.toUpperCase()}-CATEGORY`,
          },
        },
      },
      include: { variants: true },
    });
    await prisma.inventoryMovement.create({
      data: {
        kind: 'RESERVE',
        effectKey: categoryMovementKey,
        variantId: product.variants[0].id,
        quantity: 1,
      },
    });

    // Second run on the same database: the category delete must not be blocked.
    runSeed();

    expect(await prisma.product.count({ where: { id: product.id } })).toBe(0);
    expect(
      await prisma.inventoryMovement.count({
        where: { effectKey: categoryMovementKey },
      }),
    ).toBe(0);
  });

  it('deletes orders, campaign products and product images that point at a fixture address, design or media asset, and keeps an unrelated order', async () => {
    const { prisma } = context;
    runSeed();

    const fixtureDesign = await prisma.design.findFirstOrThrow({
      where: { id: { startsWith: 'e2e-' } },
      orderBy: { id: 'asc' },
    });
    const fixtureMedia = await prisma.mediaAsset.findFirstOrThrow({
      where: { id: { startsWith: 'e2e-' } },
      orderBy: { id: 'asc' },
    });
    await prisma.user.create({
      data: {
        id: limits.user,
        email: `${marker}-limits@example.test`,
        firstName: 'Limits',
        lastName: 'User',
      },
    });
    await prisma.address.create({
      data: {
        id: limits.address,
        userId: limits.user,
        addressLine1: '1 Test Street',
        city: 'Ikeja',
        state: 'Lagos',
      },
    });
    await prisma.category.create({
      data: {
        id: limits.category,
        name: 'TTW-212 limits',
        slug: limits.category,
      },
    });
    const product = await prisma.product.create({
      data: {
        id: limits.product,
        categoryId: limits.category,
        name: 'TTW-212 limits product',
        slug: limits.product,
        variants: {
          create: {
            name: 'TTW-212 limits',
            sku: `${marker.toUpperCase()}-LIMITS`,
          },
        },
      },
      include: { variants: true },
    });
    const variantId = product.variants[0].id;
    const campaign = await prisma.campaign.create({
      data: {
        organizerId: limits.user,
        title: 'TTW-212 limits',
        slug: `${marker}-limits-campaign`,
      },
    });
    const orderData = (
      shippingAddressId: string,
      reference: string,
      designId?: string,
    ) => ({
      userId: limits.user,
      shippingAddressId,
      subtotalAmount: '1000.00',
      totalAmount: '1000.00',
      shipLine1: '1 Test Street',
      shipCity: 'Ikeja',
      shipState: 'Lagos',
      paymentReference: reference,
      items: {
        create: {
          productId: product.id,
          variantId,
          designId,
          quantity: 1,
          unitBasePrice: '1000.00',
          unitFinalPrice: '1000.00',
          productNameSnapshot: 'ttw-212',
          variantDisplaySnapshot: 'ttw-212',
          snapshotSource: 'PURCHASE' as const,
        },
      },
    });
    // Three orders of a non-fixture user: one ships to a fixture address, one
    // holds a fixture design, one touches nothing of the seed.
    const toFixtureAddress = await prisma.order.create({
      data: orderData('e2e-address-customer-main', `${marker}-order-address`),
    });
    const withFixtureDesign = await prisma.order.create({
      data: orderData(
        limits.address,
        `${marker}-order-design`,
        fixtureDesign.id,
      ),
    });
    const unrelated = await prisma.order.create({
      data: orderData(limits.address, `${marker}-order-unrelated`),
    });
    await prisma.campaignProduct.create({
      data: {
        campaignId: campaign.id,
        productId: product.id,
        designId: fixtureDesign.id,
      },
    });
    await prisma.productImage.create({
      data: { productId: product.id, mediaAssetId: fixtureMedia.id },
    });

    // Second run on the same database: none of these rows may block it.
    runSeed();

    expect(
      await prisma.order.findMany({
        where: {
          id: { in: [toFixtureAddress.id, withFixtureDesign.id, unrelated.id] },
        },
        select: { id: true },
      }),
    ).toEqual([{ id: unrelated.id }]);
    expect(
      await prisma.campaignProduct.count({
        where: { productId: product.id },
      }),
    ).toBe(0);
    expect(
      await prisma.productImage.count({ where: { productId: product.id } }),
    ).toBe(0);
    expect(await prisma.product.count({ where: { id: product.id } })).toBe(1);
  });

  it('covers the last links: category orders, generated variants, designs and addresses of fixture users', async () => {
    const { prisma } = context;
    runSeed();

    const fixtureProduct = await prisma.product.findFirstOrThrow({
      where: { id: { startsWith: 'e2e-' } },
      orderBy: { id: 'asc' },
    });
    await prisma.user.create({
      data: {
        id: more.user,
        email: `${marker}-more@example.test`,
        firstName: 'More',
        lastName: 'User',
      },
    });
    const addressData = (id: string, userId: string) => ({
      id,
      userId,
      addressLine1: '1 Test Street',
      city: 'Ikeja',
      state: 'Lagos',
    });
    await prisma.address.create({ data: addressData(more.address, more.user) });
    await prisma.address.create({
      data: addressData(more.fixtureUserAddress, 'e2e-user-customer'),
    });
    await prisma.category.create({
      data: { id: more.category, name: 'TTW-212 more', slug: more.category },
    });
    // P1 sits in a fixture category; P2 in a control category.
    const inFixtureCategory = await prisma.product.create({
      data: {
        categoryId: fixtureProduct.categoryId,
        name: 'TTW-212 more P1',
        slug: `${marker}-more-p1`,
        variants: {
          create: {
            name: 'TTW-212 more',
            sku: `${marker.toUpperCase()}-MORE-1`,
          },
        },
      },
      include: { variants: true },
    });
    const controlProduct = await prisma.product.create({
      data: {
        categoryId: more.category,
        name: 'TTW-212 more P2',
        slug: `${marker}-more-p2`,
        variants: {
          create: {
            name: 'TTW-212 more',
            sku: `${marker.toUpperCase()}-MORE-2`,
          },
        },
      },
      include: { variants: true },
    });
    const campaign = await prisma.campaign.create({
      data: {
        organizerId: more.user,
        title: 'TTW-212 more',
        slug: `${marker}-more-campaign`,
      },
    });
    const orderFor = (
      reference: string,
      shippingAddressId: string,
      product: { id: string; variants: { id: string }[] },
      designId?: string,
    ) => ({
      userId: more.user,
      shippingAddressId,
      subtotalAmount: '1000.00',
      totalAmount: '1000.00',
      shipLine1: '1 Test Street',
      shipCity: 'Ikeja',
      shipState: 'Lagos',
      paymentReference: `${marker}-more-${reference}`,
      items: {
        create: {
          productId: product.id,
          variantId: product.variants[0].id,
          designId,
          quantity: 1,
          unitBasePrice: '1000.00',
          unitFinalPrice: '1000.00',
          productNameSnapshot: 'ttw-212',
          variantDisplaySnapshot: 'ttw-212',
          snapshotSource: 'PURCHASE' as const,
        },
      },
    });
    // 1. Order of a non-fixture user on a product in a fixture category.
    const categoryOrder = await prisma.order.create({
      data: orderFor('category', more.address, inFixtureCategory),
    });
    await prisma.campaignProduct.create({
      data: { campaignId: campaign.id, productId: inFixtureCategory.id },
    });
    await prisma.design.create({
      data: {
        userId: more.user,
        productId: inFixtureCategory.id,
        name: `${marker}-more-design-category`,
        designData: {},
      },
    });
    // 2. A variant with a generated id under a fixture product (id `e2e-`, in a
    // control category so the category rule cannot cover it), with a movement.
    const fixtureIdProduct = await prisma.product.create({
      data: {
        id: `e2e-${marker}-more-product`,
        categoryId: more.category,
        name: 'TTW-212 more fixture-id product',
        slug: `${marker}-more-fixture-id-product`,
      },
    });
    const generatedVariant = await prisma.productVariant.create({
      data: {
        productId: fixtureIdProduct.id,
        name: 'TTW-212 generated',
        sku: `${marker.toUpperCase()}-GENERATED`,
      },
    });
    await prisma.inventoryMovement.create({
      data: {
        kind: 'RESERVE',
        effectKey: `${marker}:more-movement`,
        variantId: generatedVariant.id,
        quantity: 1,
      },
    });
    // 3. A design of a fixture user on a control product, used by a third party.
    const fixtureUserDesign = await prisma.design.create({
      data: {
        userId: 'e2e-user-customer',
        productId: controlProduct.id,
        name: `${marker}-more-design-fixture-user`,
        designData: {},
      },
    });
    const designOrder = await prisma.order.create({
      data: orderFor(
        'design',
        more.address,
        controlProduct,
        fixtureUserDesign.id,
      ),
    });
    await prisma.campaignProduct.create({
      data: {
        campaignId: campaign.id,
        productId: controlProduct.id,
        designId: fixtureUserDesign.id,
      },
    });
    // 4. An order shipped to a generated address of a fixture user.
    const addressOrder = await prisma.order.create({
      data: orderFor('address', more.fixtureUserAddress, controlProduct),
    });
    const unrelated = await prisma.order.create({
      data: orderFor('unrelated', more.address, controlProduct),
    });

    // Second run on the same database: none of these rows may block it.
    runSeed();

    expect(
      await prisma.order.findMany({
        where: {
          id: {
            in: [
              categoryOrder.id,
              designOrder.id,
              addressOrder.id,
              unrelated.id,
            ],
          },
        },
        select: { id: true },
      }),
    ).toEqual([{ id: unrelated.id }]);
    expect(
      await prisma.campaignProduct.count({
        where: { campaignId: campaign.id },
      }),
    ).toBe(0);
    expect(
      await prisma.design.count({
        where: { name: { startsWith: `${marker}-more-design` } },
      }),
    ).toBe(0);
    expect(
      await prisma.productVariant.count({ where: { id: generatedVariant.id } }),
    ).toBe(0);
    expect(
      await prisma.product.count({ where: { id: controlProduct.id } }),
    ).toBe(1);
  });
});
