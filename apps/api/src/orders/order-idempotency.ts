import { createHash } from 'node:crypto';

/**
 * Order create idempotency (TTW-037): a key replays an order only for the same
 * request content. The fingerprint covers the lines, the delivery address as
 * stored when the request is made, and the campaign.
 */
export const IDEMPOTENCY_KEY_REUSED = 'IDEMPOTENCY_KEY_REUSED';
export const IDEMPOTENCY_KEY_PAYLOAD_MISMATCH =
  'IDEMPOTENCY_KEY_PAYLOAD_MISMATCH';

const FINGERPRINT_VERSION = 'v1';

export interface FingerprintAddress {
  id: string;
  recipientName?: string | null;
  phone?: string | null;
  addressLine1?: string | null;
  addressLine2?: string | null;
  city?: string | null;
  state?: string | null;
  postalCode?: string | null;
  country?: string | null;
  landmark?: string | null;
  instructions?: string | null;
}

export interface FingerprintInput {
  campaignId: string | null;
  address: FingerprintAddress | null;
  items: Array<{
    variantId: string;
    designId?: string | null;
    quantity: number;
  }>;
}

export function computeOrderRequestFingerprint(
  input: FingerprintInput,
): string {
  const lines = input.items
    .map((item) => [item.variantId, item.designId ?? null, item.quantity])
    .map((line) => JSON.stringify(line))
    // Code-point order: independent of the process locale.
    .sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  const a = input.address;
  const address = a
    ? [
        a.id,
        a.recipientName ?? null,
        a.phone ?? null,
        a.addressLine1 ?? null,
        a.addressLine2 ?? null,
        a.city ?? null,
        a.state ?? null,
        a.postalCode ?? null,
        a.country ?? null,
        a.landmark ?? null,
        a.instructions ?? null,
      ]
    : null;
  const canonical = JSON.stringify([input.campaignId, address, lines]);
  const digest = createHash('sha256').update(canonical).digest('hex');
  return `${FINGERPRINT_VERSION}:${digest}`;
}
