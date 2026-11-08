/**
 * TTW-086: the API refuses an address outside every shipping zone with this
 * stable code. The checkout shows its own wording and keeps the cart.
 */
export const SHIPPING_ADDRESS_NOT_COVERED = 'SHIPPING_ADDRESS_NOT_COVERED';

export const SHIPPING_NOT_COVERED_MESSAGE =
  "We don't deliver to this address yet. Check the state and LGA, or use another delivery address. Your cart is saved.";

export function isShippingNotCovered(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    (error as { code?: unknown }).code === SHIPPING_ADDRESS_NOT_COVERED
  );
}
