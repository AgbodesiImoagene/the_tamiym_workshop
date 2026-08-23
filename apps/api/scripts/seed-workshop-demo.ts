/**
 * Seed workshop-ready demo products for local development.
 *
 * Usage:
 *   pnpm --filter api seed:workshop-demo
 *
 * Safety:
 * - Refuses non-dev databases unless ALLOW_NON_TEST_DATABASE_SEED=true.
 * - Uses deterministic ids prefixed with demo-workshop-.
 */
import 'dotenv/config';
import * as bcrypt from 'bcrypt';
import {
  CurrencyCode,
  ProductStatus,
  UserRole,
  UserStatus,
} from '../src/generated/prisma/client';
import {
  assertDevOrAllowedDatabase,
  seedWorkshopView,
  type WorkshopLayerSeedIds,
} from './workshop-seed-shared';
import {
  closePrismaScriptContext,
  createPrismaScriptContext,
} from './_prisma-script-client';

const PREFIX = 'demo-workshop-';
const DEMO_PASSWORD = 'DemoPassword1!';

const IDS = {
  category: `${PREFIX}category-apparel`,
  products: {
    tee: `${PREFIX}product-classic-tee`,
    hoodie: `${PREFIX}product-campus-hoodie`,
  },
  productViews: {
    teeFront: `${PREFIX}product-view-tee-front`,
    hoodieFront: `${PREFIX}product-view-hoodie-front`,
  },
  options: {
    teeSize: `${PREFIX}option-tee-size`,
    teeColor: `${PREFIX}option-tee-color`,
    hoodieSize: `${PREFIX}option-hoodie-size`,
  },
  optionValues: {
    teeSizeM: `${PREFIX}option-value-tee-size-m`,
    teeSizeL: `${PREFIX}option-value-tee-size-l`,
    teeColorNavy: `${PREFIX}option-value-tee-color-navy`,
    teeColorWhite: `${PREFIX}option-value-tee-color-white`,
    hoodieSizeM: `${PREFIX}option-value-hoodie-size-m`,
  },
  variants: {
    teeNavyM: `${PREFIX}variant-tee-navy-m`,
    hoodieBlackM: `${PREFIX}variant-hoodie-black-m`,
  },
  users: {
    customer: `${PREFIX}user-customer`,
    admin: `${PREFIX}user-admin`,
  },
} as const;

const teeWorkshopIds: WorkshopLayerSeedIds = {
  mediaAssets: {
    base: `${PREFIX}media-tee-base`,
    mask: `${PREFIX}media-tee-mask`,
  },
  mediaDerivatives: {
    baseOriginal: `${PREFIX}media-derivative-tee-base-original`,
    baseDisplay: `${PREFIX}media-derivative-tee-base-display`,
    baseThumb: `${PREFIX}media-derivative-tee-base-thumb`,
    maskOriginal: `${PREFIX}media-derivative-tee-mask-original`,
    maskDisplay: `${PREFIX}media-derivative-tee-mask-display`,
    maskThumb: `${PREFIX}media-derivative-tee-mask-thumb`,
  },
  productImages: {
    base: `${PREFIX}product-image-tee-base`,
    mask: `${PREFIX}product-image-tee-mask`,
  },
  productImageRoles: {
    base: `${PREFIX}product-image-role-tee-base`,
    mask: `${PREFIX}product-image-role-tee-mask`,
  },
  templateLayers: {
    base: `${PREFIX}template-layer-tee-base`,
    mask: `${PREFIX}template-layer-tee-mask`,
  },
  printArea: `${PREFIX}print-area-tee-front`,
  templateEffects: [
    {
      id: `${PREFIX}template-effect-tee-navy`,
      optionId: IDS.options.teeColor,
      optionValueId: IDS.optionValues.teeColorNavy,
      templateLayerId: `${PREFIX}template-layer-tee-mask`,
      tintHex: '#1f3c88',
    },
    {
      id: `${PREFIX}template-effect-tee-white`,
      optionId: IDS.options.teeColor,
      optionValueId: IDS.optionValues.teeColorWhite,
      templateLayerId: `${PREFIX}template-layer-tee-mask`,
      tintHex: '#ffffff',
    },
  ],
};

const hoodieWorkshopIds: WorkshopLayerSeedIds = {
  mediaAssets: { base: `${PREFIX}media-hoodie-base` },
  mediaDerivatives: {
    baseOriginal: `${PREFIX}media-derivative-hoodie-base-original`,
    baseDisplay: `${PREFIX}media-derivative-hoodie-base-display`,
    baseThumb: `${PREFIX}media-derivative-hoodie-base-thumb`,
  },
  productImages: { base: `${PREFIX}product-image-hoodie-base` },
  productImageRoles: { base: `${PREFIX}product-image-role-hoodie-base` },
  templateLayers: { base: `${PREFIX}template-layer-hoodie-base` },
  printArea: `${PREFIX}print-area-hoodie-front`,
};

function toAmount(amount: number): string {
  return amount.toFixed(2);
}

async function main() {
  const context = createPrismaScriptContext();
  const { prisma, databaseUrl } = context;

  assertDevOrAllowedDatabase(databaseUrl);

  const hashedPassword = await bcrypt.hash(DEMO_PASSWORD, 10);

  try {
    await prisma.category.upsert({
      where: { id: IDS.category },
      create: {
        id: IDS.category,
        name: 'Workshop Demo Apparel',
        slug: 'workshop-demo-apparel',
        description: 'Local dev fixtures for design workshop flows',
      },
      update: {},
    });

    await prisma.product.createMany({
      data: [
        {
          id: IDS.products.tee,
          categoryId: IDS.category,
          name: 'Demo Classic Tee',
          slug: 'demo-classic-tee',
          description: 'Workshop demo crew-neck tee with color mask effects.',
          status: ProductStatus.ACTIVE,
          weightGrams: 220,
        },
        {
          id: IDS.products.hoodie,
          categoryId: IDS.category,
          name: 'Demo Campus Hoodie',
          slug: 'demo-campus-hoodie',
          description: 'Workshop demo hoodie with a single BASE template layer.',
          status: ProductStatus.ACTIVE,
          weightGrams: 640,
        },
      ],
      skipDuplicates: true,
    });

    await prisma.productView.createMany({
      data: [
        {
          id: IDS.productViews.teeFront,
          productId: IDS.products.tee,
          key: 'front',
          displayName: 'Front',
          sortOrder: 0,
          isDesignable: true,
          isDefault: true,
        },
        {
          id: IDS.productViews.hoodieFront,
          productId: IDS.products.hoodie,
          key: 'front',
          displayName: 'Front',
          sortOrder: 0,
          isDesignable: true,
          isDefault: true,
        },
      ],
      skipDuplicates: true,
    });

    await prisma.productOption.createMany({
      data: [
        {
          id: IDS.options.teeSize,
          productId: IDS.products.tee,
          code: 'size',
          name: 'Size',
          sortOrder: 0,
        },
        {
          id: IDS.options.teeColor,
          productId: IDS.products.tee,
          code: 'color',
          name: 'Color',
          sortOrder: 1,
        },
        {
          id: IDS.options.hoodieSize,
          productId: IDS.products.hoodie,
          code: 'size',
          name: 'Size',
          sortOrder: 0,
        },
      ],
      skipDuplicates: true,
    });

    await prisma.productOptionValue.createMany({
      data: [
        {
          id: IDS.optionValues.teeSizeM,
          optionId: IDS.options.teeSize,
          valueCode: 'M',
          displayName: 'Medium',
          sortOrder: 0,
        },
        {
          id: IDS.optionValues.teeSizeL,
          optionId: IDS.options.teeSize,
          valueCode: 'L',
          displayName: 'Large',
          sortOrder: 1,
        },
        {
          id: IDS.optionValues.teeColorNavy,
          optionId: IDS.options.teeColor,
          valueCode: 'NAVY',
          displayName: 'Navy',
          metadata: { hex: '#1f3c88' },
          sortOrder: 0,
        },
        {
          id: IDS.optionValues.teeColorWhite,
          optionId: IDS.options.teeColor,
          valueCode: 'WHITE',
          displayName: 'White',
          metadata: { hex: '#ffffff' },
          sortOrder: 1,
        },
        {
          id: IDS.optionValues.hoodieSizeM,
          optionId: IDS.options.hoodieSize,
          valueCode: 'M',
          displayName: 'Medium',
          sortOrder: 0,
        },
      ],
      skipDuplicates: true,
    });

    await prisma.productVariant.createMany({
      data: [
        {
          id: IDS.variants.teeNavyM,
          productId: IDS.products.tee,
          name: 'Medium / Navy',
          sku: 'DEMO-TEE-M-NAVY',
          isAvailable: true,
        },
        {
          id: IDS.variants.hoodieBlackM,
          productId: IDS.products.hoodie,
          name: 'Medium / Black',
          sku: 'DEMO-HOODIE-M-BLACK',
          isAvailable: true,
        },
      ],
      skipDuplicates: true,
    });

    await prisma.variantOptionValue.createMany({
      data: [
        {
          variantId: IDS.variants.teeNavyM,
          optionId: IDS.options.teeSize,
          optionValueId: IDS.optionValues.teeSizeM,
        },
        {
          variantId: IDS.variants.teeNavyM,
          optionId: IDS.options.teeColor,
          optionValueId: IDS.optionValues.teeColorNavy,
        },
        {
          variantId: IDS.variants.hoodieBlackM,
          optionId: IDS.options.hoodieSize,
          optionValueId: IDS.optionValues.hoodieSizeM,
        },
      ],
      skipDuplicates: true,
    });

    await prisma.inventoryItem.createMany({
      data: [
        {
          variantId: IDS.variants.teeNavyM,
          stockOnHand: 50,
          reserved: 0,
          trackInventory: true,
          lowStockThreshold: 5,
        },
        {
          variantId: IDS.variants.hoodieBlackM,
          stockOnHand: 25,
          reserved: 0,
          trackInventory: true,
          lowStockThreshold: 3,
        },
      ],
      skipDuplicates: true,
    });

    await prisma.productPrice.createMany({
      data: [
        {
          id: `${PREFIX}product-price-tee`,
          productId: IDS.products.tee,
          currency: CurrencyCode.NGN,
          amount: toAmount(7500),
        },
        {
          id: `${PREFIX}product-price-hoodie`,
          productId: IDS.products.hoodie,
          currency: CurrencyCode.NGN,
          amount: toAmount(13500),
        },
      ],
      skipDuplicates: true,
    });

    await seedWorkshopView(prisma, {
      productId: IDS.products.tee,
      productViewId: IDS.productViews.teeFront,
      ids: teeWorkshopIds,
      labels: { product: 'Demo Tee', view: 'Front' },
      colorOptionId: IDS.options.teeColor,
    });

    await seedWorkshopView(prisma, {
      productId: IDS.products.hoodie,
      productViewId: IDS.productViews.hoodieFront,
      ids: hoodieWorkshopIds,
      labels: { product: 'Demo Hoodie', view: 'Front' },
    });

    await prisma.user.upsert({
      where: { email: 'demo.customer@tamiym.local' },
      create: {
        id: IDS.users.customer,
        email: 'demo.customer@tamiym.local',
        passwordHash: hashedPassword,
        firstName: 'Demo',
        lastName: 'Customer',
        role: UserRole.CUSTOMER,
        status: UserStatus.ACTIVE,
        emailVerifiedAt: new Date(),
      },
      update: {
        passwordHash: hashedPassword,
        status: UserStatus.ACTIVE,
        emailVerifiedAt: new Date(),
      },
    });

    await prisma.user.upsert({
      where: { email: 'demo.admin@tamiym.local' },
      create: {
        id: IDS.users.admin,
        email: 'demo.admin@tamiym.local',
        passwordHash: hashedPassword,
        firstName: 'Demo',
        lastName: 'Admin',
        role: UserRole.ADMIN,
        status: UserStatus.ACTIVE,
        emailVerifiedAt: new Date(),
      },
      update: {
        passwordHash: hashedPassword,
        role: UserRole.ADMIN,
        status: UserStatus.ACTIVE,
        emailVerifiedAt: new Date(),
      },
    });

    console.log('Workshop demo seed complete.');
    console.log('Customer: demo.customer@tamiym.local / DemoPassword1!');
    console.log('Admin: demo.admin@tamiym.local / DemoPassword1!');
    console.log(
      'Set AUTH_ADMIN_MFA_DISABLED=true in apps/api/.env.local for password-only admin login.',
    );
  } finally {
    await closePrismaScriptContext(context);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
