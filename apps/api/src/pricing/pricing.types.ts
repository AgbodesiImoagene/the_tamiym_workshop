/**
 * Internal types for the pricing pipeline.
 * Monetary amounts use per-currency rounding (see currency-rounding.ts): minor-unit precision
 * and optional display granularity (e.g. nearest 100 NGN for the final total).
 */

import type { ShippingQuoteBreakdown } from '../shipping/shipping.types';

/** Input for pricing pipeline. Product is derived from the variant. */
export interface PricingLineItemInput {
  variantId: string;
  designId: string | null;
  campaignId: string | null;
  quantity: number;
}

export interface PricingLineItemOutput {
  productId: string;
  variantId: string;
  designId: string | null;
  campaignId: string | null;
  quantity: number;
  unitBasePrice: number;
  unitViewSurcharge: number;
  unitDiscountAmount: number;
  unitFinalPrice: number;
  lineTotal: number;
  /** For campaign items: cost basis for organizer (may include view surcharges). */
  organizerCostBasis: number | null;
  /** When a campaign discount was applied, its ID (same for all lines in the quote). */
  appliedDiscountId?: string | null;
  /** Structured breakdown for OrderItem.pricingBreakdown snapshot. */
  pricingBreakdown: PricingBreakdown;
  /** Snapshot of option values for OrderItem.variantSnapshot. */
  variantSnapshot: Array<{
    option: string;
    optionCode: string;
    value: string;
    valueCode: string;
  }>;
}

export interface PricingBreakdown {
  version: 1;
  unitBasePrice: number;
  optionValueUpcharge: number;
  bulkAdjustment?: number;
  unitViewSurcharge: number;
  unitDiscountAmount: number;
  unitFinalPrice: number;
  /** Campaign-only: organizer cost per unit before discount. */
  organizerCostBasis?: number;
}

export type ShippingBreakdown = ShippingQuoteBreakdown;

export interface QuoteResult {
  currency: string;
  items: PricingLineItemOutput[];
  subtotalAmount: number;
  discountAmount: number;
  /** When a campaign discount was applied, its ID for persisting OrderDiscount. */
  appliedDiscountId?: string;
  shippingFee: number;
  /** VAT amount (already included in prices if pricesIncludeVat). */
  vatAmount: number;
  totalAmount: number;
  shippingBreakdown: ShippingBreakdown | null;
}

export type QuoteMode = 'standard' | 'campaign';
