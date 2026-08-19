/**
 * Paystack transfer body `reference`: lowercase a-z0-9_- , length 16–50.
 * Derived from our stable attempt key so inconclusive retries stay idempotent.
 */
export function toPaystackTransferReference(idempotencyKey: string): string {
  const cleaned = idempotencyKey.toLowerCase().replace(/[^a-z0-9_-]/g, '');
  const padded =
    cleaned.length >= 16
      ? cleaned
      : `${cleaned}${'0'.repeat(16 - cleaned.length)}`;
  return padded.slice(0, 50);
}
