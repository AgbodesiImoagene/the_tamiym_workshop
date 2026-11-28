/**
 * TTW-204: what the customer product list shows under a photo, derived from a product's
 * variants and product-level bulk tiers. Display only: the server quote stays the price
 * authority, and raw variants and tiers are never put in the list response.
 */

import { isColorOptionCode, isHexColor } from './color-option';

const SIZE_CODE = 'size';

export interface CardSummaryVariant {
  optionValues: Array<{
    option: { code: string };
    optionValue: {
      valueCode: string;
      displayName: string;
      sortOrder: number;
      metadata: unknown;
    };
  }>;
}

export interface CardSummaryTier {
  minQuantity: number;
  pricePerUnit: { toString(): string } | string | number;
}

export interface ProductCardSummary {
  colors: Array<{ code: string; name: string; hex: string | null }>;
  sizeRange: string | null;
  bulkTier: { minQuantity: number; pricePerUnit: number } | null;
}

function hexOf(metadata: unknown): string | null {
  if (typeof metadata !== 'object' || metadata === null) return null;
  const hex = (metadata as { hex?: unknown }).hex;
  return isHexColor(hex) ? hex : null;
}

/** Option values of one kind (colour or size), each once, in option-value order. */
function distinctValues(
  variants: CardSummaryVariant[],
  isWanted: (optionCode: string) => boolean,
) {
  const found = new Map<
    string,
    { code: string; name: string; sortOrder: number; metadata: unknown }
  >();
  for (const variant of variants) {
    for (const entry of variant.optionValues) {
      if (!isWanted(entry.option.code)) continue;
      const { valueCode, displayName, sortOrder, metadata } = entry.optionValue;
      if (!found.has(valueCode)) {
        found.set(valueCode, {
          code: valueCode,
          name: displayName,
          sortOrder,
          metadata,
        });
      }
    }
  }
  // The code breaks ties, so equal sort orders never change order between requests.
  return [...found.values()].sort(
    (a, b) => a.sortOrder - b.sortOrder || a.code.localeCompare(b.code),
  );
}

export function summarizeProductCard(input: {
  variants: CardSummaryVariant[];
  bulkPricingTiers: CardSummaryTier[];
}): ProductCardSummary {
  const colors = distinctValues(input.variants, isColorOptionCode).map(
    (color) => ({
      code: color.code,
      name: color.name,
      hex: hexOf(color.metadata),
    }),
  );

  const sizes = distinctValues(
    input.variants,
    (code) => code.toLowerCase() === SIZE_CODE,
  );
  const sizeRange =
    sizes.length === 0
      ? null
      : sizes.length === 1
        ? sizes[0].name
        : `${sizes[0].name}-${sizes[sizes.length - 1].name}`;

  let bulkTier: ProductCardSummary['bulkTier'] = null;
  for (const tier of input.bulkPricingTiers) {
    const pricePerUnit = Number(tier.pricePerUnit.toString());
    if (bulkTier === null || pricePerUnit < bulkTier.pricePerUnit) {
      bulkTier = { minQuantity: tier.minQuantity, pricePerUnit };
    }
  }

  return { colors, sizeRange, bulkTier };
}
