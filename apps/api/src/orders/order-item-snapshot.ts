/**
 * TTW-033 customer-visible OrderItem display snapshot constants.
 * Policy: customer-order-detail/v1-interim-2026-08-21
 */

/** Schema version written into OrderItem.snapshotVersion for new purchases. */
export const ORDER_ITEM_DISPLAY_SNAPSHOT_VERSION = 1;

/** Interim policy id for customer order detail / line snapshots. */
export const CUSTOMER_ORDER_DETAIL_POLICY_VERSION =
  'customer-order-detail/v1-interim-2026-08-21';

/**
 * Slice-1 shipment copy while TTW-040 owns the real timeline.
 * Returned on every customer order detail until shipment models exist.
 */
export const CUSTOMER_ORDER_SHIPMENT_PLACEHOLDER =
  'Shipping updates will appear here when available.';

/** Option row shape shared by variantSnapshot and optionPresentationSnapshot. */
export interface OrderItemOptionPresentation {
  option: string;
  optionCode: string;
  value: string;
  valueCode: string;
}

/** Customer-visible display fields captured at quote/purchase time. */
export interface OrderItemDisplaySnapshots {
  productNameSnapshot: string;
  variantDisplaySnapshot: string;
  optionPresentationSnapshot: OrderItemOptionPresentation[];
}

/** Build a stable variant display label from name + optional SKU. */
export function formatVariantDisplaySnapshot(
  name: string,
  sku?: string | null,
): string {
  const trimmedName = name.trim() || 'Variant';
  const trimmedSku = sku?.trim();
  if (trimmedSku) {
    return `${trimmedName} (${trimmedSku})`;
  }
  return trimmedName;
}
