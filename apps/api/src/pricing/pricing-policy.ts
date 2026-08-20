import type { QuoteResult as BaseQuoteResult } from './pricing.types';

/**
 * Interim NGN v1 pricing/tax policy identifier snapshotted onto quotes and orders.
 * Owner legal/receipt/accounting sign-off may revise this string in a follow-up ticket;
 * changing it must not rewrite historical order snapshots.
 */
export const PRICING_POLICY_VERSION = 'ngn-v1-interim-2026-08';

/**
 * Quote result with TTW-024 tax/rounding/policy snapshots.
 * Invariants:
 * - subtotalAmount is merchandise before discounts
 * - subtotalAmount - discountAmount === sum(lineTotal)
 * - totalAmount === totalBeforeDisplayRounding + roundingAdjustment
 */
export type QuoteResult = BaseQuoteResult & {
  totalBeforeDisplayRounding: number;
  roundingAdjustment: number;
  vatRate: number;
  pricesIncludeVat: boolean;
  vatAppliesToShipping: boolean;
  pricingPolicyVersion: string;
};
