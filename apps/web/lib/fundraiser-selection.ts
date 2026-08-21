import type { PublicFundraiserProduct, PublicFundraiserVariant } from '@/lib/fundraisers';

export function variantKey(optionValueIds: string[]): string {
  return [...optionValueIds].sort().join('|');
}

export function findVariantForSelection(
  product: PublicFundraiserProduct,
  selectedByOptionId: Record<string, string>
): PublicFundraiserVariant | null {
  const selectedIds = product.options.map((opt) => selectedByOptionId[opt.id]).filter(Boolean);
  if (selectedIds.length !== product.options.length) return null;
  const key = variantKey(selectedIds);
  return product.variants.find((v) => variantKey(v.optionValueIds) === key) ?? null;
}

export function optionSelectionFromVariant(
  product: PublicFundraiserProduct,
  variant: PublicFundraiserVariant
): Record<string, string> {
  const next: Record<string, string> = {};
  for (const opt of product.options) {
    const match = variant.optionValueIds.find((id) => opt.values.some((v) => v.id === id));
    if (match) next[opt.id] = match;
  }
  return next;
}

/** Prefer first fully available combination; fall back to first variant's values. */
export function defaultOptionSelection(product: PublicFundraiserProduct): Record<string, string> {
  const available = product.variants.find((v) => v.available) ?? product.variants[0];
  if (!available) return {};
  return optionSelectionFromVariant(product, available);
}

/**
 * A value is selectable if some available variant includes it.
 * Dependent options are reset when the clicked value is applied.
 */
export function isOptionValueSelectable(
  product: PublicFundraiserProduct,
  valueId: string
): boolean {
  return product.variants.some(
    (variant) => variant.available && variant.optionValueIds.includes(valueId)
  );
}

/** Apply a clicked option value, resetting other options when the matrix is sparse. */
export function applyOptionValueSelection(
  product: PublicFundraiserProduct,
  selectedByOptionId: Record<string, string>,
  optionId: string,
  valueId: string
): Record<string, string> {
  if (!isOptionValueSelectable(product, valueId)) {
    return selectedByOptionId;
  }
  const tentative = { ...selectedByOptionId, [optionId]: valueId };
  const exact = findVariantForSelection(product, tentative);
  if (exact?.available) {
    return optionSelectionFromVariant(product, exact);
  }
  const fallback = product.variants.find((v) => v.available && v.optionValueIds.includes(valueId));
  if (fallback) {
    return optionSelectionFromVariant(product, fallback);
  }
  return selectedByOptionId;
}
