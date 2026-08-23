import type { PrismaClient } from '../src/generated/prisma/client';
import {
  BlendMode,
  ImageRole,
  MediaAssetStatus,
  MediaDerivativeType,
  MediaSourceType,
  ModerationStatus,
  TemplateEffectType,
  TemplateLayerType,
  VirusScanStatus,
} from '../src/generated/prisma/client';

export function placeholderImage(
  size: string,
  label: string,
  bg = 'e5e7eb',
  fg = '111827',
): string {
  return `https://placehold.co/${size}/${bg}/${fg}.png?text=${encodeURIComponent(label)}`;
}

export type WorkshopLayerSeedIds = {
  mediaAssets: { base: string; mask?: string };
  mediaDerivatives: {
    baseOriginal: string;
    baseDisplay: string;
    baseThumb: string;
    maskOriginal?: string;
    maskDisplay?: string;
    maskThumb?: string;
  };
  productImages: { base: string; mask?: string };
  productImageRoles: { base: string; mask?: string };
  templateLayers: { base: string; mask?: string };
  printArea: string;
  templateEffects?: Array<{
    id: string;
    optionId: string;
    optionValueId: string;
    templateLayerId: string;
    tintHex?: string;
  }>;
};

export type WorkshopProductSeedInput = {
  productId: string;
  productViewId: string;
  ids: WorkshopLayerSeedIds;
  labels: { product: string; view: string };
  colorOptionId?: string;
};

function mediaAssetRow(
  id: string,
  key: string,
  url: string,
  width: number,
  height: number,
  bytes: number,
  checksum: string,
) {
  return {
    id,
    sourceType: MediaSourceType.UPLOAD,
    status: MediaAssetStatus.READY,
    scanStatus: VirusScanStatus.CLEAN,
    moderationStatus: ModerationStatus.APPROVED,
    originalKey: key,
    originalUrl: url,
    originalMime: 'image/png',
    originalBytes: bytes,
    originalWidth: width,
    originalHeight: height,
    checksum,
  };
}

function derivativeRow(
  id: string,
  assetId: string,
  type: MediaDerivativeType,
  key: string,
  url: string,
  width: number,
  height: number,
  bytes: number,
) {
  return {
    id,
    assetId,
    type,
    key,
    url,
    mimeType: 'image/png',
    sizeBytes: bytes,
    width,
    height,
  };
}

/**
 * Inserts media assets, product images, workshop template layers, print area,
 * and optional color TINT effects for one designable product view.
 */
export async function seedWorkshopView(
  prisma: PrismaClient,
  input: WorkshopProductSeedInput,
): Promise<void> {
  const { productId, productViewId, ids, labels, colorOptionId } = input;
  const baseLabel = labels.product;
  const baseUrl = placeholderImage('600x600', `${baseLabel} Base`, 'd4d4d8');
  const maskUrl = placeholderImage(
    '600x600',
    `${baseLabel} Mask`,
    'ffffff',
    '9ca3af',
  );

  const mediaAssets = [
    mediaAssetRow(
      ids.mediaAssets.base,
      `${ids.mediaAssets.base}/original.png`,
      baseUrl,
      600,
      600,
      120000,
      `checksum-${ids.mediaAssets.base}`,
    ),
  ];
  if (ids.mediaAssets.mask) {
    mediaAssets.push(
      mediaAssetRow(
        ids.mediaAssets.mask,
        `${ids.mediaAssets.mask}/original.png`,
        maskUrl,
        600,
        600,
        110000,
        `checksum-${ids.mediaAssets.mask}`,
      ),
    );
  }

  const derivatives = [
    derivativeRow(
      ids.mediaDerivatives.baseOriginal,
      ids.mediaAssets.base,
      MediaDerivativeType.ORIGINAL,
      `${ids.mediaAssets.base}/original.png`,
      baseUrl,
      600,
      600,
      120000,
    ),
    derivativeRow(
      ids.mediaDerivatives.baseDisplay,
      ids.mediaAssets.base,
      MediaDerivativeType.DISPLAY,
      `${ids.mediaAssets.base}/display.png`,
      placeholderImage('800x800', `${baseLabel} Base`, 'd4d4d8'),
      800,
      800,
      80000,
    ),
    derivativeRow(
      ids.mediaDerivatives.baseThumb,
      ids.mediaAssets.base,
      MediaDerivativeType.THUMB,
      `${ids.mediaAssets.base}/thumb.png`,
      placeholderImage('240x240', baseLabel, 'd4d4d8'),
      240,
      240,
      15000,
    ),
  ];

  if (ids.mediaAssets.mask && ids.mediaDerivatives.maskOriginal) {
    derivatives.push(
      derivativeRow(
        ids.mediaDerivatives.maskOriginal,
        ids.mediaAssets.mask,
        MediaDerivativeType.ORIGINAL,
        `${ids.mediaAssets.mask}/original.png`,
        maskUrl,
        600,
        600,
        110000,
      ),
      derivativeRow(
        ids.mediaDerivatives.maskDisplay!,
        ids.mediaAssets.mask,
        MediaDerivativeType.DISPLAY,
        `${ids.mediaAssets.mask}/display.png`,
        placeholderImage('800x800', `${baseLabel} Mask`, 'ffffff', '9ca3af'),
        800,
        800,
        75000,
      ),
      derivativeRow(
        ids.mediaDerivatives.maskThumb!,
        ids.mediaAssets.mask,
        MediaDerivativeType.THUMB,
        `${ids.mediaAssets.mask}/thumb.png`,
        placeholderImage('240x240', 'Mask', 'ffffff', '9ca3af'),
        240,
        240,
        14000,
      ),
    );
  }

  await prisma.mediaAsset.createMany({
    data: mediaAssets,
    skipDuplicates: true,
  });
  await prisma.mediaDerivative.createMany({
    data: derivatives,
    skipDuplicates: true,
  });

  const productImages = [
    {
      id: ids.productImages.base,
      productId,
      mediaAssetId: ids.mediaAssets.base,
      sortOrder: 0,
      altText: `${labels.product} workshop base`,
    },
  ];
  if (ids.productImages.mask && ids.mediaAssets.mask) {
    productImages.push({
      id: ids.productImages.mask,
      productId,
      mediaAssetId: ids.mediaAssets.mask,
      sortOrder: 1,
      altText: `${labels.product} workshop mask`,
    });
  }

  await prisma.productImage.createMany({
    data: productImages,
    skipDuplicates: true,
  });

  const imageRoles = [
    {
      id: ids.productImageRoles.base,
      productId,
      imageId: ids.productImages.base,
      role: ImageRole.WORKSHOP_TEMPLATE,
      productViewId,
      sortOrder: 0,
    },
  ];
  if (ids.productImageRoles.mask && ids.productImages.mask) {
    imageRoles.push({
      id: ids.productImageRoles.mask,
      productId,
      imageId: ids.productImages.mask,
      role: ImageRole.WORKSHOP_TEMPLATE,
      productViewId,
      sortOrder: 1,
    });
  }

  await prisma.productImageRole.createMany({
    data: imageRoles,
    skipDuplicates: true,
  });

  const templateLayers: Array<{
    id: string;
    productId: string;
    productViewId: string;
    key: string;
    displayName: string;
    layerType: TemplateLayerType;
    imageId: string;
    blendMode: BlendMode;
    opacity: number;
    zIndex: number;
  }> = [
    {
      id: ids.templateLayers.base,
      productId,
      productViewId,
      key: 'base',
      displayName: 'Base garment',
      layerType: TemplateLayerType.BASE,
      imageId: ids.productImages.base,
      blendMode: BlendMode.NORMAL,
      opacity: 1,
      zIndex: 0,
    },
  ];
  if (ids.templateLayers.mask && ids.productImages.mask) {
    templateLayers.push({
      id: ids.templateLayers.mask,
      productId,
      productViewId,
      key: 'color_mask',
      displayName: 'Color mask',
      layerType: TemplateLayerType.MASK_OVERLAY,
      imageId: ids.productImages.mask,
      blendMode: BlendMode.MULTIPLY,
      opacity: 1,
      zIndex: 1,
    });
  }

  await prisma.workshopTemplateLayer.createMany({
    data: templateLayers,
    skipDuplicates: true,
  });

  await prisma.printArea.createMany({
    data: [
      {
        id: ids.printArea,
        productId,
        productViewId,
        x: 0.25,
        y: 0.2,
        width: 0.5,
        height: 0.45,
        rotationAllowed: false,
        maxLayers: 10,
        maxColors: 6,
      },
    ],
    skipDuplicates: true,
  });

  if (ids.templateEffects?.length && colorOptionId) {
    await prisma.optionValueTemplateEffect.createMany({
      data: ids.templateEffects.map((effect) => ({
        id: effect.id,
        productId,
        productViewId,
        optionId: effect.optionId,
        optionValueId: effect.optionValueId,
        templateLayerId: effect.templateLayerId,
        effectType: TemplateEffectType.TINT,
        tintHex: effect.tintHex ?? null,
      })),
      skipDuplicates: true,
    });
  }
}

export function assertDevOrAllowedDatabase(databaseUrl: string): void {
  if (process.env['ALLOW_NON_TEST_DATABASE_SEED'] === 'true') {
    return;
  }

  const nodeEnv = process.env['NODE_ENV']?.toLowerCase();
  if (nodeEnv === 'development' || nodeEnv === 'test') {
    return;
  }

  const looksLikeTestDatabase = /test|e2e/i.test(databaseUrl);
  if (looksLikeTestDatabase) {
    return;
  }

  throw new Error(
    'Refusing to seed workshop demo into a non-dev database. Set NODE_ENV=development, use a test DATABASE_URL, or set ALLOW_NON_TEST_DATABASE_SEED=true to override.',
  );
}
