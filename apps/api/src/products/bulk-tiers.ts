/**
 * TTW-269: bulk pricing tiers as the public product detail shows them, in the shape of the
 * list's `bulkTier`. Display only: the server quote stays the price authority.
 */
import type { CurrencyCode } from '../generated/prisma/enums';

export const BULK_TIER_SELECT = {
  minQuantity: true,
  maxQuantity: true,
  pricePerUnit: true,
  currency: true,
} as const;

export interface BulkTierRow {
  minQuantity: number;
  maxQuantity: number | null;
  pricePerUnit: { toString(): string };
  currency: CurrencyCode;
}

export function toBulkTiers(rows: BulkTierRow[]) {
  return rows.map((row) => ({
    minQuantity: row.minQuantity,
    maxQuantity: row.maxQuantity,
    pricePerUnit: Number(row.pricePerUnit.toString()),
    currency: row.currency,
  }));
}
