/**
 * TTW-092: turns the variants of a product into colours with a list of sizes, for the
 * product page. Pure and display-only: the server quote stays the price authority.
 */

import type { DashboardProductDetail } from './products';

type Variant = DashboardProductDetail['variants'][number];

export interface VariantChoice {
  variantId: string;
  variantName: string;
  sizeLabel: string;
  optionSummary: string;
  /** Available and in stock: the only variants a customer can add to the cart. */
  purchasable: boolean;
  /** Tracked stock, or `null` when stock is not tracked. */
  maxQuantity: number | null;
  unitPrice: number;
  currency: string;
}

export interface ColorGroup {
  code: string;
  label: string;
  choices: VariantChoice[];
}

export interface ProductImage {
  id: string;
  url: string;
  altText: string | null;
}

const COLOR_CODE = 'color';
const SIZE_CODE = 'size';
const DEFAULT_GROUP = { code: 'default', label: 'Default' };

function optionValue(variant: Variant, code: string) {
  return variant.optionValues.find((entry) => entry.option.code.toLowerCase() === code)
    ?.optionValue;
}

function toChoice(variant: Variant, detail: DashboardProductDetail): VariantChoice {
  const inStock = variant.inStock && (variant.availableQuantity ?? 1) > 0;
  return {
    variantId: variant.id,
    variantName: variant.name,
    sizeLabel: optionValue(variant, SIZE_CODE)?.displayName ?? variant.name,
    optionSummary:
      variant.optionValues
        .map((entry) => `${entry.option.name}: ${entry.optionValue.displayName}`)
        .join(' • ') || 'Default option',
    purchasable: variant.isAvailable && inStock,
    maxQuantity: variant.availableQuantity ?? null,
    unitPrice: Number(variant.resolvedPrice ?? detail.resolvedBasePrice ?? 0),
    currency: variant.resolvedCurrency ?? detail.resolvedCurrency ?? 'NGN',
  };
}

/** Colours in the order the API lists them; a product without a colour option gets one "Default". */
export function groupVariantsByColor(detail: DashboardProductDetail): ColorGroup[] {
  const groups = new Map<string, ColorGroup>();
  for (const variant of detail.variants) {
    const color = optionValue(variant, COLOR_CODE);
    const code = color?.valueCode ?? DEFAULT_GROUP.code;
    let group = groups.get(code);
    if (!group) {
      group = { code, label: color?.displayName ?? DEFAULT_GROUP.label, choices: [] };
      groups.set(code, group);
    }
    group.choices.push(toChoice(variant, detail));
  }
  return [...groups.values()];
}

/** Images of the chosen colour, else the images that belong to no variant, else none. */
export function imagesForColor(detail: DashboardProductDetail, group: ColorGroup): ProductImage[] {
  const variantIds = new Set(group.choices.map((choice) => choice.variantId));
  const usable = detail.images.filter(
    (image): image is DashboardProductDetail['images'][number] & { url: string } =>
      typeof image.url === 'string' && image.url.length > 0
  );
  const toImage = (image: (typeof usable)[number]): ProductImage => ({
    id: image.id,
    url: image.url,
    altText: image.altText ?? null,
  });

  const ofColor = usable.filter((image) => image.variantId && variantIds.has(image.variantId));
  if (ofColor.length > 0) return ofColor.map(toImage);
  return usable.filter((image) => !image.variantId).map(toImage);
}
