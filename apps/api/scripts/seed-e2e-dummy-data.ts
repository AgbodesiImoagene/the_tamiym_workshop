/**
 * Populate a test database with deterministic dummy data for e2e flows.
 *
 * Usage:
 * pnpm run seed:e2e
 *
 * Safety:
 * - Refuses to run unless the database URL or NODE_ENV looks test-like.
 * - Override only when intentional with ALLOW_NON_TEST_DATABASE_SEED=true.
 */
import 'dotenv/config';
import * as bcrypt from 'bcrypt';
import {
  CampaignStatus,
  CurrencyCode,
  LedgerEntryType,
  MediaAssetStatus,
  MediaDerivativeType,
  MediaSourceType,
  ModerationStatus,
  PaymentProvider,
  PaymentStatus,
  PayoutMode,
  PayoutRunStatus,
  PayoutStatus,
  ProductStatus,
  RefundStatus,
  ShippingRateProvider,
  ShippingRuleMatchType,
  UserRole,
  UserStatus,
  VirusScanStatus,
} from '../src/generated/prisma/client';
import {
  assertTestDatabase,
  closePrismaScriptContext,
  createPrismaScriptContext,
} from './_prisma-script-client';
import {
  decodeMfaEncryptionKey,
  encryptTotpSecret,
  generateRecoveryCodes,
  hashRecoveryCode,
  MFA_TOTP_KEY_VERSION,
} from '../src/auth/admin-mfa.crypto';

const FIXTURE_PREFIX = 'e2e-';
const FIXTURE_PASSWORD = 'TestPassword1!';
/** Deterministic admin TOTP secret for Playwright MFA challenge (TTW-023). */
const E2E_ADMIN_TOTP_SECRET = 'JBSWY3DPEHPK3PXP';
/**
 * Deterministic recovery codes for the primary e2e admin only (hashed at rest).
 * Multiple codes so Playwright recovery smoke stays idempotent under CI retries.
 * Keep in sync with `E2E_ADMIN_RECOVERY_CODES` in tests/e2e/fixtures/identities.ts.
 */
const E2E_ADMIN_RECOVERY_CODES = [
  'A1B2-C3D4-E5F6-7890-ABCD-EF01-2345-6789',
  'B2C3-D4E5-F678-90AB-CDEF-0123-4567-89AB',
  'C3D4-E5F6-7890-ABCD-EF01-2345-6789-ABCD',
] as const;
/** Distinct from primary — `codeHash` is globally unique. */
const E2E_APPROVER_RECOVERY_CODES = [
  'D4E5-F678-90AB-CDEF-0123-4567-89AB-CDEF',
  'E5F6-7890-ABCD-EF01-2345-6789-ABCD-EF01',
  'F678-90AB-CDEF-0123-4567-89AB-CDEF-0123',
] as const;

const IDS = {
  users: {
    adminPrimary: 'e2e-user-admin-primary',
    adminApprover: 'e2e-user-admin-approver',
    adminEnroll: 'e2e-user-admin-enroll',
    organizer: 'e2e-user-organizer',
    customer: 'e2e-user-customer',
  },
  address: 'e2e-address-customer-main',
  payoutProfile: 'e2e-payout-profile-organizer-default',
  categories: {
    apparel: 'e2e-category-apparel',
    accessories: 'e2e-category-accessories',
  },
  products: {
    tee: 'e2e-product-classic-tee',
    hoodie: 'e2e-product-campus-hoodie',
  },
  productViews: {
    teeFront: 'e2e-product-view-tee-front',
    hoodieFront: 'e2e-product-view-hoodie-front',
  },
  options: {
    teeSize: 'e2e-option-tee-size',
    teeColor: 'e2e-option-tee-color',
    hoodieSize: 'e2e-option-hoodie-size',
  },
  optionValues: {
    teeSizeM: 'e2e-option-value-tee-size-m',
    teeSizeL: 'e2e-option-value-tee-size-l',
    teeColorNavy: 'e2e-option-value-tee-color-navy',
    teeColorWhite: 'e2e-option-value-tee-color-white',
    hoodieSizeS: 'e2e-option-value-hoodie-size-s',
    hoodieSizeM: 'e2e-option-value-hoodie-size-m',
  },
  variants: {
    teeNavyM: 'e2e-variant-tee-navy-m',
    teeWhiteL: 'e2e-variant-tee-white-l',
    hoodieBlackS: 'e2e-variant-hoodie-black-s',
    hoodieBlackM: 'e2e-variant-hoodie-black-m',
  },
  shipping: {
    lagosZone: 'e2e-shipping-zone-lagos',
    lagosArea: 'e2e-shipping-zone-area-lagos',
    lagosRule: 'e2e-shipping-zone-rule-lagos-admin1',
    lagosRate: 'e2e-shipping-rate-lagos-standard',
  },
  campaigns: {
    active: 'e2e-campaign-campus-outreach',
    review: 'e2e-campaign-choir-fundraiser',
  },
  mediaAssets: {
    pendingUpload: 'e2e-media-asset-pending-upload',
    flaggedUpload: 'e2e-media-asset-flagged-upload',
  },
  mediaDerivatives: {
    pendingOriginal: 'e2e-media-derivative-pending-original',
    pendingDisplay: 'e2e-media-derivative-pending-display',
    pendingThumb: 'e2e-media-derivative-pending-thumb',
    flaggedOriginal: 'e2e-media-derivative-flagged-original',
    flaggedDisplay: 'e2e-media-derivative-flagged-display',
    flaggedThumb: 'e2e-media-derivative-flagged-thumb',
  },
  designAssets: {
    pendingUpload: 'e2e-design-asset-pending-upload',
    flaggedUpload: 'e2e-design-asset-flagged-upload',
  },
  designs: {
    pending: 'e2e-design-pending-community-tee',
    flaggedCampaign: 'e2e-design-flagged-choir-hoodie',
  },
  designViews: {
    pendingFront: 'e2e-design-view-pending-front',
    flaggedFront: 'e2e-design-view-flagged-front',
  },
  campaignProducts: {
    activeTee: 'e2e-campaign-product-campus-tee',
    reviewHoodie: 'e2e-campaign-product-choir-hoodie',
  },
  orders: {
    pending: 'e2e-order-pending-payment',
    paidCampaign: 'e2e-order-paid-campaign',
    processing: 'e2e-order-processing',
    fulfilled: 'e2e-order-fulfilled',
    deliveredCampaign: 'e2e-order-delivered-campaign',
    cancelled: 'e2e-order-cancelled',
    refunded: 'e2e-order-refunded',
  },
  orderItems: {
    pending: 'e2e-order-item-pending',
    paidCampaign: 'e2e-order-item-paid-campaign',
    processing: 'e2e-order-item-processing',
    fulfilled: 'e2e-order-item-fulfilled',
    deliveredCampaign: 'e2e-order-item-delivered-campaign',
    cancelled: 'e2e-order-item-cancelled',
    refunded: 'e2e-order-item-refunded',
  },
  payments: {
    pending: 'e2e-payment-pending',
    paidCampaign: 'e2e-payment-paid-campaign',
    processing: 'e2e-payment-processing',
    fulfilled: 'e2e-payment-fulfilled',
    deliveredCampaign: 'e2e-payment-delivered-campaign',
    cancelled: 'e2e-payment-cancelled',
    refunded: 'e2e-payment-refunded',
  },
  refunds: {
    refunded: 'e2e-refund-refunded-order',
  },
  payoutRuns: {
    pendingApproval: 'e2e-payout-run-pending-approval',
    completed: 'e2e-payout-run-completed',
  },
  payouts: {
    pendingApproval: 'e2e-payout-pending-approval',
    succeeded: 'e2e-payout-succeeded',
    failed: 'e2e-payout-failed',
    manualAdjustment: 'e2e-payout-manual-adjustment',
  },
  ledgerEntries: {
    settledPaidCampaign: 'e2e-ledger-payment-paid-campaign',
    settledDeliveredCampaign: 'e2e-ledger-payment-delivered-campaign',
    payoutSucceeded: 'e2e-ledger-payout-succeeded',
    payoutReservedFailed: 'e2e-ledger-payout-failed-reserved',
    payoutFailedRelease: 'e2e-ledger-payout-failed-release',
  },
} as const;

function daysAgo(days: number): Date {
  const value = new Date();
  value.setDate(value.getDate() - days);
  return value;
}

function daysFromNow(days: number): Date {
  const value = new Date();
  value.setDate(value.getDate() + days);
  return value;
}

function toAmount(amount: number): string {
  return amount.toFixed(2);
}

function variantSnapshot(
  option: string,
  optionCode: string,
  value: string,
  valueCode: string,
) {
  return [{ option, optionCode, value, valueCode }];
}

function placeholderImage(
  size: string,
  label: string,
  bg = 'e5e7eb',
  fg = '111827',
) {
  return `https://placehold.co/${size}/${bg}/${fg}.png?text=${encodeURIComponent(label)}`;
}

async function clearFixtureData() {
  const context = createPrismaScriptContext();
  const { prisma } = context;

  try {
    await prisma.authToken.deleteMany({
      where: { userId: { startsWith: FIXTURE_PREFIX } },
    });
    await prisma.refund.deleteMany({
      where: { id: { startsWith: FIXTURE_PREFIX } },
    });
    await prisma.payment.deleteMany({
      where: { id: { startsWith: FIXTURE_PREFIX } },
    });
    await prisma.orderItem.deleteMany({
      where: { id: { startsWith: FIXTURE_PREFIX } },
    });
    await prisma.order.deleteMany({
      where: { id: { startsWith: FIXTURE_PREFIX } },
    });
    await prisma.campaignBalanceLedgerEntry.deleteMany({
      where: { id: { startsWith: FIXTURE_PREFIX } },
    });
    await prisma.payout.deleteMany({
      where: { id: { startsWith: FIXTURE_PREFIX } },
    });
    await prisma.payoutRun.deleteMany({
      where: { id: { startsWith: FIXTURE_PREFIX } },
    });
    await prisma.campaignProductPrice.deleteMany({
      where: { id: { startsWith: FIXTURE_PREFIX } },
    });
    await prisma.campaignProduct.deleteMany({
      where: { id: { startsWith: FIXTURE_PREFIX } },
    });
    await prisma.campaign.deleteMany({
      where: { id: { startsWith: FIXTURE_PREFIX } },
    });
    await prisma.designView.deleteMany({
      where: {
        OR: [
          { designId: { startsWith: FIXTURE_PREFIX } },
          { productViewId: { startsWith: FIXTURE_PREFIX } },
        ],
      },
    });
    await prisma.designAsset.deleteMany({
      where: {
        OR: [
          { id: { startsWith: FIXTURE_PREFIX } },
          { mediaAssetId: { startsWith: FIXTURE_PREFIX } },
          { ownerUserId: { startsWith: FIXTURE_PREFIX } },
        ],
      },
    });
    await prisma.mediaDerivative.deleteMany({
      where: {
        OR: [
          { id: { startsWith: FIXTURE_PREFIX } },
          { assetId: { startsWith: FIXTURE_PREFIX } },
        ],
      },
    });
    await prisma.design.deleteMany({
      where: { id: { startsWith: FIXTURE_PREFIX } },
    });
    await prisma.mediaAsset.deleteMany({
      where: { id: { startsWith: FIXTURE_PREFIX } },
    });
    await prisma.userPayoutProfile.deleteMany({
      where: { id: { startsWith: FIXTURE_PREFIX } },
    });
    await prisma.inventoryItem.deleteMany({
      where: { variantId: { startsWith: FIXTURE_PREFIX } },
    });
    await prisma.variantOptionValue.deleteMany({
      where: {
        OR: [
          { variantId: { startsWith: FIXTURE_PREFIX } },
          { optionId: { startsWith: FIXTURE_PREFIX } },
          { optionValueId: { startsWith: FIXTURE_PREFIX } },
        ],
      },
    });
    await prisma.variantPrice.deleteMany({
      where: { id: { startsWith: FIXTURE_PREFIX } },
    });
    await prisma.productOptionValue.deleteMany({
      where: { id: { startsWith: FIXTURE_PREFIX } },
    });
    await prisma.productOption.deleteMany({
      where: { id: { startsWith: FIXTURE_PREFIX } },
    });
    await prisma.productPrice.deleteMany({
      where: { id: { startsWith: FIXTURE_PREFIX } },
    });
    await prisma.productVariant.deleteMany({
      where: { id: { startsWith: FIXTURE_PREFIX } },
    });
    await prisma.productView.deleteMany({
      where: { id: { startsWith: FIXTURE_PREFIX } },
    });
    await prisma.product.deleteMany({
      where: { id: { startsWith: FIXTURE_PREFIX } },
    });
    await prisma.category.deleteMany({
      where: { id: { startsWith: FIXTURE_PREFIX } },
    });
    await prisma.address.deleteMany({
      where: { id: { startsWith: FIXTURE_PREFIX } },
    });
    await prisma.userOAuthAccount.deleteMany({
      where: { userId: { startsWith: FIXTURE_PREFIX } },
    });
    await prisma.adminMfaRecoveryCode.deleteMany({
      where: { userId: { startsWith: FIXTURE_PREFIX } },
    });
    await prisma.adminMfaCredential.deleteMany({
      where: { userId: { startsWith: FIXTURE_PREFIX } },
    });
    await prisma.authSession.deleteMany({
      where: { userId: { startsWith: FIXTURE_PREFIX } },
    });
    await prisma.user.deleteMany({
      where: { id: { startsWith: FIXTURE_PREFIX } },
    });
    await prisma.shippingRate.deleteMany({
      where: { id: { startsWith: FIXTURE_PREFIX } },
    });
    await prisma.shippingZoneRule.deleteMany({
      where: { id: { startsWith: FIXTURE_PREFIX } },
    });
    await prisma.shippingZoneArea.deleteMany({
      where: { id: { startsWith: FIXTURE_PREFIX } },
    });
    await prisma.shippingZone.deleteMany({
      where: { id: { startsWith: FIXTURE_PREFIX } },
    });
  } finally {
    await closePrismaScriptContext(context);
  }
}

async function main() {
  const context = createPrismaScriptContext();
  const { prisma, databaseUrl } = context;
  const hashedPassword = await bcrypt.hash(FIXTURE_PASSWORD, 10);

  assertTestDatabase(databaseUrl);

  try {
    await clearFixtureData();

    await prisma.geoState.upsert({
      where: { code: 'LA' },
      update: { name: 'Lagos', isActive: true },
      create: { code: 'LA', name: 'Lagos', isActive: true },
    });
    await prisma.geoLga.upsert({
      where: {
        stateCode_name: {
          stateCode: 'LA',
          name: 'Ikeja',
        },
      },
      update: { isActive: true },
      create: {
        stateCode: 'LA',
        name: 'Ikeja',
        isActive: true,
      },
    });

    await prisma.siteSettings.upsert({
      where: { id: 'default' },
      update: {
        vatRate: toAmount(0.075),
        pricesIncludeVat: true,
        vatAppliesToShipping: true,
        currency: CurrencyCode.NGN,
        payoutMode: PayoutMode.AUTO_APPROVAL_REQUIRED,
        payoutCadenceDays: 7,
        payoutSettlementHoldDays: 7,
        minimumPayoutAmount: toAmount(1000),
        autoRetryFailedPayouts: true,
      },
      create: {
        id: 'default',
        vatRate: toAmount(0.075),
        pricesIncludeVat: true,
        vatAppliesToShipping: true,
        currency: CurrencyCode.NGN,
        payoutMode: PayoutMode.AUTO_APPROVAL_REQUIRED,
        payoutCadenceDays: 7,
        payoutSettlementHoldDays: 7,
        minimumPayoutAmount: toAmount(1000),
        autoRetryFailedPayouts: true,
      },
    });

    await prisma.shippingZone.create({
      data: {
        id: IDS.shipping.lagosZone,
        name: 'Lagos Mainland',
        isActive: true,
      },
    });
    await prisma.shippingZoneArea.create({
      data: {
        id: IDS.shipping.lagosArea,
        zoneId: IDS.shipping.lagosZone,
        stateCode: 'LA',
      },
    });
    await prisma.shippingZoneRule.create({
      data: {
        id: IDS.shipping.lagosRule,
        zoneId: IDS.shipping.lagosZone,
        countryCode: 'NG',
        matchType: ShippingRuleMatchType.ADMIN1,
        matchValue: 'LA',
        priority: 100,
        isActive: true,
      },
    });
    await prisma.shippingRate.create({
      data: {
        id: IDS.shipping.lagosRate,
        zoneId: IDS.shipping.lagosZone,
        provider: ShippingRateProvider.INTERNAL,
        serviceLevel: 'STANDARD',
        currency: CurrencyCode.NGN,
        flatFee: toAmount(2000),
        priority: 100,
        isActive: true,
        minDeliveryDays: 2,
        maxDeliveryDays: 4,
      },
    });

    await prisma.user.createMany({
      data: [
        {
          id: IDS.users.adminPrimary,
          email: 'admin.e2e@tamiym.test',
          passwordHash: hashedPassword,
          role: UserRole.ADMIN,
          status: UserStatus.ACTIVE,
          firstName: 'Ada',
          lastName: 'Admin',
          phone: '08000000001',
          emailVerifiedAt: daysAgo(14),
        },
        {
          id: IDS.users.adminApprover,
          email: 'approver.e2e@tamiym.test',
          passwordHash: hashedPassword,
          role: UserRole.ADMIN,
          status: UserStatus.ACTIVE,
          firstName: 'Amaka',
          lastName: 'Approver',
          phone: '08000000002',
          emailVerifiedAt: daysAgo(14),
        },
        {
          // No MFA credential — Playwright enrollment UI smoke (TTW-023).
          id: IDS.users.adminEnroll,
          email: 'admin.enroll.e2e@tamiym.test',
          passwordHash: hashedPassword,
          role: UserRole.ADMIN,
          status: UserStatus.ACTIVE,
          firstName: 'Efe',
          lastName: 'Enroll',
          phone: '08000000005',
          emailVerifiedAt: daysAgo(14),
        },
        {
          id: IDS.users.organizer,
          email: 'organizer.e2e@tamiym.test',
          passwordHash: hashedPassword,
          role: UserRole.ORGANIZER,
          status: UserStatus.ACTIVE,
          firstName: 'Tobi',
          lastName: 'Organizer',
          phone: '08000000003',
          emailVerifiedAt: daysAgo(12),
        },
        {
          id: IDS.users.customer,
          email: 'customer.e2e@tamiym.test',
          passwordHash: hashedPassword,
          role: UserRole.CUSTOMER,
          status: UserStatus.ACTIVE,
          firstName: 'Kemi',
          lastName: 'Customer',
          phone: '08000000004',
          emailVerifiedAt: daysAgo(10),
        },
      ],
    });

    // Pre-enroll primary/approver MFA so Playwright can challenge with a known TOTP.
    // Leave adminEnroll without credentials for enrollment UI coverage.
    const mfaKey = decodeMfaEncryptionKey(process.env.MFA_TOTP_ENCRYPTION_KEY);
    const encryptedTotp = encryptTotpSecret(E2E_ADMIN_TOTP_SECRET, mfaKey);
    const adminIds = [IDS.users.adminPrimary, IDS.users.adminApprover];
    for (const userId of adminIds) {
      await prisma.adminMfaCredential.create({
        data: {
          userId,
          secretCiphertext: encryptedTotp.ciphertext,
          secretNonce: encryptedTotp.nonce,
          keyVersion: MFA_TOTP_KEY_VERSION,
          enabledAt: daysAgo(7),
        },
      });
      const recoveryCodes =
        userId === IDS.users.adminPrimary
          ? [...E2E_ADMIN_RECOVERY_CODES, ...generateRecoveryCodes(7)]
          : [...E2E_APPROVER_RECOVERY_CODES, ...generateRecoveryCodes(7)];
      await prisma.adminMfaRecoveryCode.createMany({
        data: recoveryCodes.map((code) => ({
          userId,
          codeHash: hashRecoveryCode(code),
        })),
      });
    }

    await prisma.userPayoutProfile.create({
      data: {
        id: IDS.payoutProfile,
        userId: IDS.users.organizer,
        label: 'Default settlement account',
        bankName: 'Guaranty Trust Bank',
        bankCode: '058',
        accountName: 'Tobi Organizer',
        accountNumber: '0123456789',
        recipientCode: 'RCP_e2e_organizer',
        isDefault: true,
      },
    });

    await prisma.address.create({
      data: {
        id: IDS.address,
        userId: IDS.users.customer,
        recipientName: 'Kemi Customer',
        phone: '08000000004',
        addressLine1: '12 Allen Avenue',
        city: 'Ikeja',
        state: 'Lagos',
        stateCode: 'LA',
        country: 'Nigeria',
        countryCode: 'NG',
        isDefault: true,
      },
    });

    await prisma.category.createMany({
      data: [
        {
          id: IDS.categories.apparel,
          name: 'Apparel',
          slug: 'apparel-e2e',
          description: 'E2E apparel fixtures',
        },
        {
          id: IDS.categories.accessories,
          name: 'Accessories',
          slug: 'accessories-e2e',
          description: 'E2E accessories fixtures',
        },
      ],
    });

    await prisma.product.createMany({
      data: [
        {
          id: IDS.products.tee,
          categoryId: IDS.categories.apparel,
          name: 'Classic Tee',
          slug: 'classic-tee-e2e',
          description: 'Soft cotton crew-neck tee for test flows.',
          status: ProductStatus.ACTIVE,
          weightGrams: 220,
        },
        {
          id: IDS.products.hoodie,
          categoryId: IDS.categories.apparel,
          name: 'Campus Hoodie',
          slug: 'campus-hoodie-e2e',
          description: 'Heavyweight hoodie used in richer e2e data.',
          status: ProductStatus.ACTIVE,
          weightGrams: 640,
        },
      ],
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
          id: IDS.optionValues.hoodieSizeS,
          optionId: IDS.options.hoodieSize,
          valueCode: 'S',
          displayName: 'Small',
          sortOrder: 0,
        },
        {
          id: IDS.optionValues.hoodieSizeM,
          optionId: IDS.options.hoodieSize,
          valueCode: 'M',
          displayName: 'Medium',
          sortOrder: 1,
        },
      ],
    });

    await prisma.productVariant.createMany({
      data: [
        {
          id: IDS.variants.teeNavyM,
          productId: IDS.products.tee,
          name: 'Medium / Navy',
          sku: 'E2E-TEE-M-NAVY',
          isAvailable: true,
        },
        {
          id: IDS.variants.teeWhiteL,
          productId: IDS.products.tee,
          name: 'Large / White',
          sku: 'E2E-TEE-L-WHITE',
          isAvailable: true,
        },
        {
          id: IDS.variants.hoodieBlackS,
          productId: IDS.products.hoodie,
          name: 'Small / Black',
          sku: 'E2E-HOODIE-S-BLACK',
          isAvailable: true,
        },
        {
          id: IDS.variants.hoodieBlackM,
          productId: IDS.products.hoodie,
          name: 'Medium / Black',
          sku: 'E2E-HOODIE-M-BLACK',
          isAvailable: true,
        },
      ],
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
          variantId: IDS.variants.teeWhiteL,
          optionId: IDS.options.teeSize,
          optionValueId: IDS.optionValues.teeSizeL,
        },
        {
          variantId: IDS.variants.teeWhiteL,
          optionId: IDS.options.teeColor,
          optionValueId: IDS.optionValues.teeColorWhite,
        },
        {
          variantId: IDS.variants.hoodieBlackS,
          optionId: IDS.options.hoodieSize,
          optionValueId: IDS.optionValues.hoodieSizeS,
        },
        {
          variantId: IDS.variants.hoodieBlackM,
          optionId: IDS.options.hoodieSize,
          optionValueId: IDS.optionValues.hoodieSizeM,
        },
      ],
    });

    await prisma.inventoryItem.createMany({
      data: [
        {
          variantId: IDS.variants.teeNavyM,
          stockOnHand: 50,
          reserved: 1,
          trackInventory: true,
          lowStockThreshold: 5,
        },
        {
          variantId: IDS.variants.teeWhiteL,
          stockOnHand: 25,
          reserved: 0,
          trackInventory: true,
          lowStockThreshold: 5,
        },
        {
          variantId: IDS.variants.hoodieBlackS,
          stockOnHand: 12,
          reserved: 0,
          trackInventory: true,
          lowStockThreshold: 3,
        },
        {
          variantId: IDS.variants.hoodieBlackM,
          stockOnHand: 8,
          reserved: 0,
          trackInventory: true,
          lowStockThreshold: 3,
        },
      ],
    });

    await prisma.productPrice.createMany({
      data: [
        {
          id: 'e2e-product-price-tee',
          productId: IDS.products.tee,
          currency: CurrencyCode.NGN,
          amount: toAmount(6500),
        },
        {
          id: 'e2e-product-price-hoodie',
          productId: IDS.products.hoodie,
          currency: CurrencyCode.NGN,
          amount: toAmount(12000),
        },
      ],
    });

    await prisma.variantPrice.createMany({
      data: [
        {
          id: 'e2e-variant-price-tee-navy-m',
          variantId: IDS.variants.teeNavyM,
          currency: CurrencyCode.NGN,
          amount: toAmount(6500),
        },
        {
          id: 'e2e-variant-price-tee-white-l',
          variantId: IDS.variants.teeWhiteL,
          currency: CurrencyCode.NGN,
          amount: toAmount(7000),
        },
        {
          id: 'e2e-variant-price-hoodie-black-s',
          variantId: IDS.variants.hoodieBlackS,
          currency: CurrencyCode.NGN,
          amount: toAmount(12000),
        },
        {
          id: 'e2e-variant-price-hoodie-black-m',
          variantId: IDS.variants.hoodieBlackM,
          currency: CurrencyCode.NGN,
          amount: toAmount(13000),
        },
      ],
    });

    await prisma.mediaAsset.createMany({
      data: [
        {
          id: IDS.mediaAssets.pendingUpload,
          sourceType: MediaSourceType.UPLOAD,
          status: MediaAssetStatus.READY,
          scanStatus: VirusScanStatus.CLEAN,
          moderationStatus: ModerationStatus.PENDING,
          moderationNotes: 'Queued for human review after customer upload.',
          originalKey: 'e2e/media/pending/original.png',
          originalUrl: placeholderImage('1200x1200', 'Pending Upload'),
          originalMime: 'image/png',
          originalBytes: 148000,
          originalWidth: 1200,
          originalHeight: 1200,
          checksum: 'checksum-e2e-pending-upload',
        },
        {
          id: IDS.mediaAssets.flaggedUpload,
          sourceType: MediaSourceType.UPLOAD,
          status: MediaAssetStatus.READY,
          scanStatus: VirusScanStatus.CLEAN,
          moderationStatus: ModerationStatus.FLAGGED,
          moderationNotes: 'Logo-like artwork needs a manual decision.',
          originalKey: 'e2e/media/flagged/original.png',
          originalUrl: placeholderImage(
            '1200x1200',
            'Flagged Artwork',
            'fde68a',
          ),
          originalMime: 'image/png',
          originalBytes: 173000,
          originalWidth: 1200,
          originalHeight: 1200,
          checksum: 'checksum-e2e-flagged-upload',
        },
      ],
    });

    await prisma.mediaDerivative.createMany({
      data: [
        {
          id: IDS.mediaDerivatives.pendingOriginal,
          assetId: IDS.mediaAssets.pendingUpload,
          type: MediaDerivativeType.ORIGINAL,
          key: 'e2e/media/pending/original.png',
          url: placeholderImage('1200x1200', 'Pending Upload'),
          mimeType: 'image/png',
          sizeBytes: 148000,
          width: 1200,
          height: 1200,
        },
        {
          id: IDS.mediaDerivatives.pendingDisplay,
          assetId: IDS.mediaAssets.pendingUpload,
          type: MediaDerivativeType.DISPLAY,
          key: 'e2e/media/pending/display.png',
          url: placeholderImage('800x800', 'Pending Upload'),
          mimeType: 'image/png',
          sizeBytes: 91000,
          width: 800,
          height: 800,
        },
        {
          id: IDS.mediaDerivatives.pendingThumb,
          assetId: IDS.mediaAssets.pendingUpload,
          type: MediaDerivativeType.THUMB,
          key: 'e2e/media/pending/thumb.png',
          url: placeholderImage('240x240', 'Pending'),
          mimeType: 'image/png',
          sizeBytes: 18000,
          width: 240,
          height: 240,
        },
        {
          id: IDS.mediaDerivatives.flaggedOriginal,
          assetId: IDS.mediaAssets.flaggedUpload,
          type: MediaDerivativeType.ORIGINAL,
          key: 'e2e/media/flagged/original.png',
          url: placeholderImage('1200x1200', 'Flagged Artwork', 'fde68a'),
          mimeType: 'image/png',
          sizeBytes: 173000,
          width: 1200,
          height: 1200,
        },
        {
          id: IDS.mediaDerivatives.flaggedDisplay,
          assetId: IDS.mediaAssets.flaggedUpload,
          type: MediaDerivativeType.DISPLAY,
          key: 'e2e/media/flagged/display.png',
          url: placeholderImage('800x800', 'Flagged Artwork', 'fde68a'),
          mimeType: 'image/png',
          sizeBytes: 102000,
          width: 800,
          height: 800,
        },
        {
          id: IDS.mediaDerivatives.flaggedThumb,
          assetId: IDS.mediaAssets.flaggedUpload,
          type: MediaDerivativeType.THUMB,
          key: 'e2e/media/flagged/thumb.png',
          url: placeholderImage('240x240', 'Flagged', 'fde68a'),
          mimeType: 'image/png',
          sizeBytes: 21000,
          width: 240,
          height: 240,
        },
      ],
    });

    await prisma.campaign.createMany({
      data: [
        {
          id: IDS.campaigns.active,
          organizerId: IDS.users.organizer,
          title: 'Campus Outreach Drive',
          slug: 'campus-outreach-drive-e2e',
          description:
            'Active campaign fixture used across e2e and admin flows.',
          story: 'Students are raising funds for outreach tees and hoodies.',
          status: CampaignStatus.ACTIVE,
          moderationStatus: ModerationStatus.APPROVED,
          currency: CurrencyCode.NGN,
          goalAmount: toAmount(50000),
          currentAmount: toAmount(33000),
          startDate: daysAgo(14),
          endDate: daysFromNow(21),
          payoutProfileId: IDS.payoutProfile,
          payoutModeOverride: PayoutMode.AUTO_APPROVAL_REQUIRED,
        },
        {
          id: IDS.campaigns.review,
          organizerId: IDS.users.organizer,
          title: 'Choir Fundraiser',
          slug: 'choir-fundraiser-e2e',
          description: 'Campaign waiting for admin review.',
          story: 'Review-state campaign fixture for admin workflows.',
          status: CampaignStatus.REVIEW,
          moderationStatus: ModerationStatus.FLAGGED,
          moderationNotes: 'AI flagged wording for manual review.',
          currency: CurrencyCode.NGN,
          goalAmount: toAmount(80000),
          currentAmount: toAmount(0),
          startDate: daysAgo(2),
          endDate: daysFromNow(30),
          payoutProfileId: IDS.payoutProfile,
          payoutModeOverride: PayoutMode.MANUAL,
        },
      ],
    });

    await prisma.design.createMany({
      data: [
        {
          id: IDS.designs.pending,
          userId: IDS.users.customer,
          productId: IDS.products.tee,
          name: 'Community Tee Draft',
          designData: {
            version: 1,
            views: {
              front: {
                productViewId: IDS.productViews.teeFront,
                isUsed: true,
                layerCount: 2,
                fabricJson: {
                  objects: [
                    { type: 'textbox', text: 'Community Day 2026' },
                    { type: 'image', src: IDS.designAssets.pendingUpload },
                  ],
                },
              },
            },
          },
          thumbnailUrl: placeholderImage('640x640', 'Pending Design'),
          moderationStatus: ModerationStatus.PENDING,
          moderationNotes: 'Queued for manual review after save.',
        },
        {
          id: IDS.designs.flaggedCampaign,
          userId: IDS.users.organizer,
          productId: IDS.products.hoodie,
          campaignId: IDS.campaigns.review,
          name: 'Choir Hoodie Artwork',
          designData: {
            version: 1,
            views: {
              front: {
                productViewId: IDS.productViews.hoodieFront,
                isUsed: true,
                layerCount: 2,
                fabricJson: {
                  objects: [
                    { type: 'textbox', text: 'Choir Tour 2026' },
                    { type: 'image', src: IDS.designAssets.flaggedUpload },
                  ],
                },
              },
            },
          },
          thumbnailUrl: placeholderImage('640x640', 'Flagged Design', 'fde68a'),
          moderationStatus: ModerationStatus.FLAGGED,
          moderationNotes:
            'Possible trademark-style crest requires human review.',
        },
      ],
    });

    await prisma.designView.createMany({
      data: [
        {
          id: IDS.designViews.pendingFront,
          designId: IDS.designs.pending,
          productViewId: IDS.productViews.teeFront,
          isUsed: true,
          layerCount: 2,
        },
        {
          id: IDS.designViews.flaggedFront,
          designId: IDS.designs.flaggedCampaign,
          productViewId: IDS.productViews.hoodieFront,
          isUsed: true,
          layerCount: 2,
        },
      ],
    });

    await prisma.designAsset.createMany({
      data: [
        {
          id: IDS.designAssets.pendingUpload,
          ownerUserId: IDS.users.customer,
          mediaAssetId: IDS.mediaAssets.pendingUpload,
        },
        {
          id: IDS.designAssets.flaggedUpload,
          ownerUserId: IDS.users.organizer,
          mediaAssetId: IDS.mediaAssets.flaggedUpload,
        },
      ],
    });

    await prisma.campaignProduct.createMany({
      data: [
        {
          id: IDS.campaignProducts.activeTee,
          campaignId: IDS.campaigns.active,
          productId: IDS.products.tee,
        },
        {
          id: IDS.campaignProducts.reviewHoodie,
          campaignId: IDS.campaigns.review,
          productId: IDS.products.hoodie,
          designId: IDS.designs.flaggedCampaign,
        },
      ],
    });

    await prisma.campaignProductPrice.createMany({
      data: [
        {
          id: 'e2e-campaign-product-price-campus-tee',
          campaignProductId: IDS.campaignProducts.activeTee,
          currency: CurrencyCode.NGN,
          amount: toAmount(7500),
        },
        {
          id: 'e2e-campaign-product-price-choir-hoodie',
          campaignProductId: IDS.campaignProducts.reviewHoodie,
          currency: CurrencyCode.NGN,
          amount: toAmount(13500),
        },
      ],
    });

    await prisma.order.createMany({
      data: [
        {
          id: IDS.orders.pending,
          userId: IDS.users.customer,
          shippingAddressId: IDS.address,
          status: 'PENDING_PAYMENT',
          paymentStatus: PaymentStatus.INITIATED,
          currency: CurrencyCode.NGN,
          subtotalAmount: toAmount(6500),
          shippingFee: toAmount(2000),
          discountAmount: toAmount(0),
          totalAmount: toAmount(8500),
          shipRecipientName: 'Kemi Customer',
          shipPhone: '08000000004',
          shipLine1: '12 Allen Avenue',
          shipCity: 'Ikeja',
          shipState: 'Lagos',
          shipCountry: 'Nigeria',
          paymentReference: 'E2E-PAY-REF-PENDING',
          expiresAt: daysFromNow(1),
        },
        {
          id: IDS.orders.paidCampaign,
          userId: IDS.users.customer,
          shippingAddressId: IDS.address,
          status: 'PAID',
          paymentStatus: PaymentStatus.SUCCEEDED,
          currency: CurrencyCode.NGN,
          subtotalAmount: toAmount(15000),
          shippingFee: toAmount(0),
          discountAmount: toAmount(0),
          totalAmount: toAmount(15000),
          shipRecipientName: 'Kemi Customer',
          shipPhone: '08000000004',
          shipLine1: '12 Allen Avenue',
          shipCity: 'Ikeja',
          shipState: 'Lagos',
          shipCountry: 'Nigeria',
          paymentReference: 'E2E-PAY-REF-PAID',
          campaignId: IDS.campaigns.active,
        },
        {
          id: IDS.orders.processing,
          userId: IDS.users.customer,
          shippingAddressId: IDS.address,
          status: 'PROCESSING',
          paymentStatus: PaymentStatus.SUCCEEDED,
          currency: CurrencyCode.NGN,
          subtotalAmount: toAmount(12000),
          shippingFee: toAmount(2000),
          discountAmount: toAmount(0),
          totalAmount: toAmount(14000),
          shipRecipientName: 'Kemi Customer',
          shipPhone: '08000000004',
          shipLine1: '12 Allen Avenue',
          shipCity: 'Ikeja',
          shipState: 'Lagos',
          shipCountry: 'Nigeria',
          paymentReference: 'E2E-PAY-REF-PROCESSING',
        },
        {
          id: IDS.orders.fulfilled,
          userId: IDS.users.customer,
          shippingAddressId: IDS.address,
          status: 'FULFILLED',
          paymentStatus: PaymentStatus.SUCCEEDED,
          currency: CurrencyCode.NGN,
          subtotalAmount: toAmount(21000),
          shippingFee: toAmount(2000),
          discountAmount: toAmount(0),
          totalAmount: toAmount(23000),
          shipRecipientName: 'Kemi Customer',
          shipPhone: '08000000004',
          shipLine1: '12 Allen Avenue',
          shipCity: 'Ikeja',
          shipState: 'Lagos',
          shipCountry: 'Nigeria',
          paymentReference: 'E2E-PAY-REF-FULFILLED',
        },
        {
          id: IDS.orders.deliveredCampaign,
          userId: IDS.users.customer,
          shippingAddressId: IDS.address,
          status: 'DELIVERED',
          paymentStatus: PaymentStatus.SUCCEEDED,
          currency: CurrencyCode.NGN,
          subtotalAmount: toAmount(18000),
          shippingFee: toAmount(0),
          discountAmount: toAmount(0),
          totalAmount: toAmount(18000),
          shipRecipientName: 'Kemi Customer',
          shipPhone: '08000000004',
          shipLine1: '12 Allen Avenue',
          shipCity: 'Ikeja',
          shipState: 'Lagos',
          shipCountry: 'Nigeria',
          paymentReference: 'E2E-PAY-REF-DELIVERED',
          campaignId: IDS.campaigns.active,
        },
        {
          id: IDS.orders.cancelled,
          userId: IDS.users.customer,
          shippingAddressId: IDS.address,
          status: 'CANCELLED',
          paymentStatus: PaymentStatus.FAILED,
          currency: CurrencyCode.NGN,
          subtotalAmount: toAmount(6500),
          shippingFee: toAmount(2000),
          discountAmount: toAmount(0),
          totalAmount: toAmount(8500),
          shipRecipientName: 'Kemi Customer',
          shipPhone: '08000000004',
          shipLine1: '12 Allen Avenue',
          shipCity: 'Ikeja',
          shipState: 'Lagos',
          shipCountry: 'Nigeria',
          paymentReference: 'E2E-PAY-REF-CANCELLED',
          cancelledAt: daysAgo(2),
        },
        {
          id: IDS.orders.refunded,
          userId: IDS.users.customer,
          shippingAddressId: IDS.address,
          status: 'REFUNDED',
          paymentStatus: PaymentStatus.SUCCEEDED,
          currency: CurrencyCode.NGN,
          subtotalAmount: toAmount(13000),
          shippingFee: toAmount(2000),
          discountAmount: toAmount(0),
          totalAmount: toAmount(15000),
          shipRecipientName: 'Kemi Customer',
          shipPhone: '08000000004',
          shipLine1: '12 Allen Avenue',
          shipCity: 'Ikeja',
          shipState: 'Lagos',
          shipCountry: 'Nigeria',
          paymentReference: 'E2E-PAY-REF-REFUNDED',
        },
      ],
    });

    await prisma.orderItem.createMany({
      data: [
        {
          id: IDS.orderItems.pending,
          orderId: IDS.orders.pending,
          productId: IDS.products.tee,
          variantId: IDS.variants.teeNavyM,
          quantity: 1,
          unitBasePrice: toAmount(6500),
          unitViewSurcharge: toAmount(0),
          unitDiscountAmount: toAmount(0),
          unitFinalPrice: toAmount(6500),
          variantSnapshot: variantSnapshot('Size', 'size', 'Medium', 'M'),
        },
        {
          id: IDS.orderItems.paidCampaign,
          orderId: IDS.orders.paidCampaign,
          productId: IDS.products.tee,
          variantId: IDS.variants.teeNavyM,
          campaignId: IDS.campaigns.active,
          quantity: 2,
          unitBasePrice: toAmount(7500),
          unitViewSurcharge: toAmount(0),
          unitDiscountAmount: toAmount(0),
          unitFinalPrice: toAmount(7500),
          variantSnapshot: variantSnapshot('Color', 'color', 'Navy', 'NAVY'),
        },
        {
          id: IDS.orderItems.processing,
          orderId: IDS.orders.processing,
          productId: IDS.products.hoodie,
          variantId: IDS.variants.hoodieBlackS,
          quantity: 1,
          unitBasePrice: toAmount(12000),
          unitViewSurcharge: toAmount(0),
          unitDiscountAmount: toAmount(0),
          unitFinalPrice: toAmount(12000),
          variantSnapshot: variantSnapshot('Size', 'size', 'Small', 'S'),
        },
        {
          id: IDS.orderItems.fulfilled,
          orderId: IDS.orders.fulfilled,
          productId: IDS.products.tee,
          variantId: IDS.variants.teeWhiteL,
          quantity: 3,
          unitBasePrice: toAmount(7000),
          unitViewSurcharge: toAmount(0),
          unitDiscountAmount: toAmount(0),
          unitFinalPrice: toAmount(7000),
          variantSnapshot: variantSnapshot('Color', 'color', 'White', 'WHITE'),
        },
        {
          id: IDS.orderItems.deliveredCampaign,
          orderId: IDS.orders.deliveredCampaign,
          productId: IDS.products.tee,
          variantId: IDS.variants.teeWhiteL,
          campaignId: IDS.campaigns.active,
          quantity: 2,
          unitBasePrice: toAmount(9000),
          unitViewSurcharge: toAmount(0),
          unitDiscountAmount: toAmount(0),
          unitFinalPrice: toAmount(9000),
          variantSnapshot: variantSnapshot('Size', 'size', 'Large', 'L'),
        },
        {
          id: IDS.orderItems.cancelled,
          orderId: IDS.orders.cancelled,
          productId: IDS.products.tee,
          variantId: IDS.variants.teeNavyM,
          quantity: 1,
          unitBasePrice: toAmount(6500),
          unitViewSurcharge: toAmount(0),
          unitDiscountAmount: toAmount(0),
          unitFinalPrice: toAmount(6500),
          variantSnapshot: variantSnapshot('Color', 'color', 'Navy', 'NAVY'),
        },
        {
          id: IDS.orderItems.refunded,
          orderId: IDS.orders.refunded,
          productId: IDS.products.hoodie,
          variantId: IDS.variants.hoodieBlackM,
          quantity: 1,
          unitBasePrice: toAmount(13000),
          unitViewSurcharge: toAmount(0),
          unitDiscountAmount: toAmount(0),
          unitFinalPrice: toAmount(13000),
          variantSnapshot: variantSnapshot('Size', 'size', 'Medium', 'M'),
        },
      ],
    });

    await prisma.payment.createMany({
      data: [
        {
          id: IDS.payments.pending,
          orderId: IDS.orders.pending,
          provider: PaymentProvider.PAYSTACK,
          providerRef: 'pay_e2e_pending',
          status: PaymentStatus.INITIATED,
          currency: CurrencyCode.NGN,
          amount: toAmount(8500),
          idempotencyKey: 'idem_e2e_pending',
        },
        {
          id: IDS.payments.paidCampaign,
          orderId: IDS.orders.paidCampaign,
          provider: PaymentProvider.PAYSTACK,
          providerRef: 'pay_e2e_paid_campaign',
          status: PaymentStatus.SUCCEEDED,
          currency: CurrencyCode.NGN,
          amount: toAmount(15000),
          idempotencyKey: 'idem_e2e_paid_campaign',
        },
        {
          id: IDS.payments.processing,
          orderId: IDS.orders.processing,
          provider: PaymentProvider.PAYSTACK,
          providerRef: 'pay_e2e_processing',
          status: PaymentStatus.SUCCEEDED,
          currency: CurrencyCode.NGN,
          amount: toAmount(14000),
          idempotencyKey: 'idem_e2e_processing',
        },
        {
          id: IDS.payments.fulfilled,
          orderId: IDS.orders.fulfilled,
          provider: PaymentProvider.PAYSTACK,
          providerRef: 'pay_e2e_fulfilled',
          status: PaymentStatus.SUCCEEDED,
          currency: CurrencyCode.NGN,
          amount: toAmount(23000),
          idempotencyKey: 'idem_e2e_fulfilled',
        },
        {
          id: IDS.payments.deliveredCampaign,
          orderId: IDS.orders.deliveredCampaign,
          provider: PaymentProvider.PAYSTACK,
          providerRef: 'pay_e2e_delivered_campaign',
          status: PaymentStatus.SUCCEEDED,
          currency: CurrencyCode.NGN,
          amount: toAmount(18000),
          idempotencyKey: 'idem_e2e_delivered_campaign',
        },
        {
          id: IDS.payments.cancelled,
          orderId: IDS.orders.cancelled,
          provider: PaymentProvider.PAYSTACK,
          providerRef: 'pay_e2e_cancelled',
          status: PaymentStatus.FAILED,
          currency: CurrencyCode.NGN,
          amount: toAmount(8500),
          idempotencyKey: 'idem_e2e_cancelled',
        },
        {
          id: IDS.payments.refunded,
          orderId: IDS.orders.refunded,
          provider: PaymentProvider.PAYSTACK,
          providerRef: 'pay_e2e_refunded',
          status: PaymentStatus.SUCCEEDED,
          currency: CurrencyCode.NGN,
          amount: toAmount(15000),
          idempotencyKey: 'idem_e2e_refunded',
        },
      ],
    });

    await prisma.refund.create({
      data: {
        id: IDS.refunds.refunded,
        orderId: IDS.orders.refunded,
        provider: PaymentProvider.PAYSTACK,
        providerRef: 'refund_e2e_refunded_order',
        status: RefundStatus.SUCCEEDED,
        currency: CurrencyCode.NGN,
        amount: toAmount(15000),
        reason: 'Customer requested a size correction',
      },
    });

    await prisma.payoutRun.createMany({
      data: [
        {
          id: IDS.payoutRuns.pendingApproval,
          scheduledFor: daysFromNow(1),
          cutoffAt: daysAgo(2),
          mode: PayoutMode.AUTO_APPROVAL_REQUIRED,
          status: PayoutRunStatus.PENDING_APPROVAL,
          requestedByUserId: IDS.users.adminPrimary,
        },
        {
          id: IDS.payoutRuns.completed,
          scheduledFor: daysAgo(4),
          cutoffAt: daysAgo(6),
          mode: PayoutMode.AUTO_APPROVAL_REQUIRED,
          status: PayoutRunStatus.COMPLETED,
          requestedByUserId: IDS.users.adminPrimary,
          approvedByUserId: IDS.users.adminApprover,
          approvedAt: daysAgo(4),
          executedAt: daysAgo(3),
        },
      ],
    });

    await prisma.payout.createMany({
      data: [
        {
          id: IDS.payouts.pendingApproval,
          campaignId: IDS.campaigns.active,
          payoutRunId: IDS.payoutRuns.pendingApproval,
          recipientUserId: IDS.users.organizer,
          provider: PaymentProvider.PAYSTACK,
          status: PayoutStatus.PENDING_APPROVAL,
          currency: CurrencyCode.NGN,
          amount: toAmount(12000),
          snapshotBankCode: '058',
          snapshotAccountName: 'Tobi Organizer',
          snapshotAccountMask: '***6789',
          snapshotRecipientCode: 'RCP_e2e_organizer',
        },
        {
          id: IDS.payouts.succeeded,
          campaignId: IDS.campaigns.active,
          payoutRunId: IDS.payoutRuns.completed,
          recipientUserId: IDS.users.organizer,
          provider: PaymentProvider.PAYSTACK,
          providerRef: 'trf_e2e_succeeded',
          status: PayoutStatus.SUCCEEDED,
          currency: CurrencyCode.NGN,
          amount: toAmount(10000),
          snapshotBankCode: '058',
          snapshotAccountName: 'Tobi Organizer',
          snapshotAccountMask: '***6789',
          snapshotRecipientCode: 'RCP_e2e_organizer',
        },
        {
          id: IDS.payouts.failed,
          campaignId: IDS.campaigns.active,
          payoutRunId: IDS.payoutRuns.completed,
          recipientUserId: IDS.users.organizer,
          provider: PaymentProvider.PAYSTACK,
          providerRef: 'trf_e2e_failed',
          status: PayoutStatus.FAILED,
          currency: CurrencyCode.NGN,
          amount: toAmount(8000),
          failureReason: 'Bank network timeout',
          snapshotBankCode: '058',
          snapshotAccountName: 'Tobi Organizer',
          snapshotAccountMask: '***6789',
          snapshotRecipientCode: 'RCP_e2e_organizer',
        },
        {
          id: IDS.payouts.manualAdjustment,
          campaignId: IDS.campaigns.active,
          recipientUserId: IDS.users.organizer,
          provider: PaymentProvider.PAYSTACK,
          status: PayoutStatus.PENDING_APPROVAL,
          currency: CurrencyCode.NGN,
          amount: toAmount(2500),
          requestedByUserId: IDS.users.adminPrimary,
          approvalReason: null,
          isManualAdjustment: true,
          snapshotBankCode: '058',
          snapshotAccountName: 'Tobi Organizer',
          snapshotAccountMask: '***6789',
          snapshotRecipientCode: 'RCP_e2e_organizer',
        },
      ],
    });

    await prisma.campaignBalanceLedgerEntry.createMany({
      data: [
        {
          id: IDS.ledgerEntries.settledPaidCampaign,
          campaignId: IDS.campaigns.active,
          entryType: LedgerEntryType.PAYMENT_SETTLED,
          amount: toAmount(15000),
          currency: CurrencyCode.NGN,
          availableAt: daysAgo(9),
          orderId: IDS.orders.paidCampaign,
          metadata: { source: 'e2e-seed', orderStatus: 'PAID' },
        },
        {
          id: IDS.ledgerEntries.settledDeliveredCampaign,
          campaignId: IDS.campaigns.active,
          entryType: LedgerEntryType.PAYMENT_SETTLED,
          amount: toAmount(18000),
          currency: CurrencyCode.NGN,
          availableAt: daysAgo(8),
          orderId: IDS.orders.deliveredCampaign,
          metadata: { source: 'e2e-seed', orderStatus: 'DELIVERED' },
        },
        {
          id: IDS.ledgerEntries.payoutSucceeded,
          campaignId: IDS.campaigns.active,
          entryType: LedgerEntryType.PAYOUT_SUCCEEDED,
          amount: toAmount(-10000),
          currency: CurrencyCode.NGN,
          availableAt: daysAgo(3),
          payoutId: IDS.payouts.succeeded,
          metadata: { source: 'e2e-seed' },
        },
        {
          id: IDS.ledgerEntries.payoutReservedFailed,
          campaignId: IDS.campaigns.active,
          entryType: LedgerEntryType.PAYOUT_RESERVED,
          amount: toAmount(-8000),
          currency: CurrencyCode.NGN,
          availableAt: daysAgo(3),
          payoutId: IDS.payouts.failed,
          metadata: { source: 'e2e-seed' },
        },
        {
          id: IDS.ledgerEntries.payoutFailedRelease,
          campaignId: IDS.campaigns.active,
          entryType: LedgerEntryType.PAYOUT_FAILED,
          amount: toAmount(8000),
          currency: CurrencyCode.NGN,
          availableAt: daysAgo(3),
          payoutId: IDS.payouts.failed,
          metadata: { source: 'e2e-seed' },
        },
      ],
    });

    console.log('Seeded deterministic e2e dummy data.');
    console.log('Credentials:');
    console.log(`- Admin: admin.e2e@tamiym.test / ${FIXTURE_PASSWORD}`);
    console.log(`- Approver: approver.e2e@tamiym.test / ${FIXTURE_PASSWORD}`);
    console.log(`- Organizer: organizer.e2e@tamiym.test / ${FIXTURE_PASSWORD}`);
    console.log(`- Customer: customer.e2e@tamiym.test / ${FIXTURE_PASSWORD}`);
    console.log(
      `- Admin MFA TOTP secret (seed only): ${E2E_ADMIN_TOTP_SECRET}`,
    );
    console.log(
      `- Admin MFA recovery codes (primary, seed only): ${E2E_ADMIN_RECOVERY_CODES.join(', ')}`,
    );
    console.log(
      `- Admin MFA recovery codes (approver, seed only): ${E2E_APPROVER_RECOVERY_CODES.join(', ')}`,
    );
    console.log(
      `- Admin enroll (no MFA yet): admin.enroll.e2e@tamiym.test / ${FIXTURE_PASSWORD}`,
    );
    console.log('Fixtures:');
    console.log('- Products: classic-tee-e2e, campus-hoodie-e2e');
    console.log('- Campaigns: campus-outreach-drive-e2e, choir-fundraiser-e2e');
    console.log(
      '- Designs: Community Tee Draft (pending), Choir Hoodie Artwork (flagged)',
    );
    console.log('- Media assets: pending upload, flagged artwork');
  } finally {
    await closePrismaScriptContext(context);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
