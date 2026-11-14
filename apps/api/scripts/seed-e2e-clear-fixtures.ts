import type { PrismaClient } from '../src/generated/prisma/client';

/** Every row `seed:e2e` creates has an id (or owner id) starting with this. */
export const FIXTURE_PREFIX = 'e2e-';

/**
 * Deletes the rows a previous `seed:e2e` run created, in foreign-key order, so
 * the seed can run again on a reused database (TTW-210).
 *
 * Kept apart from `seed-e2e-dummy-data.ts`, which runs on import, so an e2e
 * spec can call it. Only rows tied to `e2e-` fixtures are deleted.
 */
export async function clearFixtureData(prisma: PrismaClient): Promise<void> {
  // Findings go with their run (cascade).
  await prisma.reconciliationRun.deleteMany({
    where: { id: { startsWith: FIXTURE_PREFIX } },
  });
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
  // TTW-210: movements written by checkout runs point at the variant with
  // `onDelete: Restrict`, so they go before the variants below.
  await prisma.inventoryMovement.deleteMany({
    where: { variantId: { startsWith: FIXTURE_PREFIX } },
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
}
