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
  /** False for the single group of a product without a colour option. */
  isColor: boolean;
  /** Swatch colour, or `null` when none is recorded. */
  hex: string | null;
  choices: VariantChoice[];
}

export interface HeadlinePrice {
  amount: number;
  /** Former price to strike through, only when higher than `amount`. */
  compareAt: number | null;
  currency: string;
  /** True when the sizes behind this price do not all cost the same. */
  from: boolean;
}

export interface ProductImage {
  id: string;
  url: string;
  altText: string | null;
}

const COLOR_CODE = 'color';
const SIZE_CODE = 'size';
const DEFAULT_GROUP = { code: 'default', label: 'Default' };
// Same rule as the API applies to the product list (`product-card-summary.ts`).
const HEX_COLOR = /^#(?:[0-9a-f]{3}|[0-9a-f]{4}|[0-9a-f]{6}|[0-9a-f]{8})$/i;

function hexOf(metadata: unknown): string | null {
  if (typeof metadata !== 'object' || metadata === null) return null;
  const hex = (metadata as { hex?: unknown }).hex;
  return typeof hex === 'string' && HEX_COLOR.test(hex) ? hex : null;
}

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
      group = {
        code,
        label: color?.displayName ?? DEFAULT_GROUP.label,
        isColor: !!color,
        hex: null,
        choices: [],
      };
      groups.set(code, group);
    }
    group.hex ??= hexOf(color?.metadata);
    group.choices.push(toChoice(variant, detail));
  }
  return [...groups.values()];
}

/** API decimals arrive as strings such as "5000.00"; `null` stays "no price". */
function toAmount(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const amount = Number(value);
  return Number.isFinite(amount) ? amount : null;
}

function withCompareAt(amount: number, compareAt: unknown): number | null {
  const former = toAmount(compareAt);
  return former !== null && former > amount ? former : null;
}

/**
 * The large price of the page: the cheapest size of the colour among those that can be
 * bought (all of them when none can), else the product base price when it has no variant.
 * Display only: the server quote stays the price authority.
 */
export function headlinePrice(
  detail: DashboardProductDetail,
  group: ColorGroup | undefined
): HeadlinePrice | null {
  const baseCurrency = detail.resolvedCurrency ?? 'NGN';
  if (!group) {
    const amount = toAmount(detail.resolvedBasePrice);
    if (amount === null) return null;
    const compareAt = withCompareAt(amount, detail.resolvedBaseCompareAt);
    return { amount, compareAt, currency: baseCurrency, from: false };
  }

  const purchasable = group.choices.filter((choice) => choice.purchasable);
  const ids = new Set(
    (purchasable.length > 0 ? purchasable : group.choices).map((choice) => choice.variantId)
  );
  const priced = detail.variants.flatMap((variant) => {
    if (!ids.has(variant.id)) return [];
    const own = toAmount(variant.resolvedPrice);
    const amount = own ?? toAmount(detail.resolvedBasePrice);
    if (amount === null) return [];
    const former = own === null ? detail.resolvedBaseCompareAt : variant.resolvedCompareAt;
    return [
      {
        amount,
        compareAt: withCompareAt(amount, former),
        currency: variant.resolvedCurrency ?? baseCurrency,
      },
    ];
  });
  if (priced.length === 0) return null;

  const lowest = priced.reduce((best, entry) => (entry.amount < best.amount ? entry : best));
  // Several sizes can share the lowest price, in no guaranteed order: a former price is
  // shown only when all of them have one, and it is the smallest.
  const formers = priced
    .filter((entry) => entry.amount === lowest.amount)
    .map((entry) => entry.compareAt);
  return {
    ...lowest,
    compareAt: formers.every((former) => former !== null) ? Math.min(...formers) : null,
    from: priced.some((entry) => entry.amount !== lowest.amount),
  };
}

/**
 * Images of the chosen colour, else the images that belong to no variant, else the product's
 * main images (the ones the product list shows), else none.
 */
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
  const shared = usable.filter((image) => !image.variantId);
  if (shared.length > 0) return shared.map(toImage);

  return detail.productImageRoles.flatMap((role, index) =>
    role.image?.url
      ? [{ id: `role-${index}`, url: role.image.url, altText: role.image.altText ?? null }]
      : []
  );
}
