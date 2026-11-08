import {
  CurrencyCode,
  PayoutMode,
  type PrismaClient,
} from '../src/generated/prisma/client';

/**
 * Site settings written by `seed:e2e` (TTW-181).
 *
 * Kept apart from `seed-e2e-dummy-data.ts`, which runs on import, so an e2e
 * spec can write the same row and read back what the database stores.
 */
export const E2E_SITE_SETTINGS = {
  /**
   * 7.5%, written with the 4 decimals of `vatRate Decimal(5,4)`. Never pass a
   * rate through a money helper: 2-decimal rounding turns 0.075 into 0.07.
   */
  vatRate: '0.0750',
  pricesIncludeVat: true,
  vatAppliesToShipping: true,
  currency: CurrencyCode.NGN,
  payoutMode: PayoutMode.AUTO_APPROVAL_REQUIRED,
  payoutCadenceDays: 7,
  payoutSettlementHoldDays: 7,
  minimumPayoutAmount: '1000.00',
  autoRetryFailedPayouts: true,
} as const;

export async function seedE2eSiteSettings(
  prisma: Pick<PrismaClient, 'siteSettings'>,
): Promise<void> {
  await prisma.siteSettings.upsert({
    where: { id: 'default' },
    update: { ...E2E_SITE_SETTINGS },
    create: { id: 'default', ...E2E_SITE_SETTINGS },
  });
}
