/**
 * TTW-040 shipment lifecycle constants.
 * Policy: shipment-lifecycle/v1-interim-2026-08-21
 */

import { ShipmentStatus } from '../generated/prisma/enums';

export const SHIPMENT_POLICY_VERSION =
  'shipment-lifecycle/v1-interim-2026-08-21';

/** Honest customer copy when the order has no shipment row yet. */
export const CUSTOMER_SHIPMENT_ABSENT_MESSAGE =
  'Shipping updates will appear here when available.';

export const SHIPMENT_CARRIER = {
  MANUAL: 'MANUAL',
  GIG: 'GIG',
  DHL: 'DHL',
  FEDEX: 'FEDEX',
  UPS: 'UPS',
  NIPOST: 'NIPOST',
  OTHER: 'OTHER',
} as const;

export type ShipmentCarrierCode =
  (typeof SHIPMENT_CARRIER)[keyof typeof SHIPMENT_CARRIER];

export const SHIPMENT_CARRIER_CODES = Object.values(SHIPMENT_CARRIER);

export const SHIPMENT_CARRIER_DISPLAY_NAME: Record<
  ShipmentCarrierCode,
  string
> = {
  MANUAL: 'Manual dispatch',
  GIG: 'GIG Logistics',
  DHL: 'DHL',
  FEDEX: 'FedEx',
  UPS: 'UPS',
  NIPOST: 'NIPOST',
  OTHER: 'Other carrier',
};

export const TRACKING_URL_ALLOWED_HOSTS = new Set([
  'tracking.dhl.com',
  'www.fedex.com',
  'www.ups.com',
  'www.giglogistics.com',
  'www.nipost.gov.ng',
  'track.ship24.com',
]);

export const SHIPMENT_EXCEPTION = {
  LATE: 'LATE',
  LOST: 'LOST',
  DAMAGED: 'DAMAGED',
  ADDRESS_FAILURE: 'ADDRESS_FAILURE',
  CUSTOMER_UNAVAILABLE: 'CUSTOMER_UNAVAILABLE',
  OTHER: 'OTHER',
} as const;

export type ShipmentExceptionCode =
  (typeof SHIPMENT_EXCEPTION)[keyof typeof SHIPMENT_EXCEPTION];

export const SHIPMENT_EXCEPTION_CODES = Object.values(SHIPMENT_EXCEPTION);

export const SHIPMENT_EXCEPTION_CUSTOMER_MESSAGE: Record<
  ShipmentExceptionCode,
  string
> = {
  LATE: 'Delivery is running later than estimated.',
  LOST: 'We are investigating a missing shipment.',
  DAMAGED: 'The shipment was reported damaged in transit.',
  ADDRESS_FAILURE: 'Delivery could not complete with the address on file.',
  CUSTOMER_UNAVAILABLE: 'Delivery attempt could not reach the recipient.',
  OTHER: 'There is a delivery issue; support will follow up.',
};

/** Allowed next statuses from the current shipment status (v1). */
export const SHIPMENT_ALLOWED_TRANSITIONS: Record<
  ShipmentStatus,
  ShipmentStatus[]
> = {
  [ShipmentStatus.READY]: [ShipmentStatus.DISPATCHED, ShipmentStatus.CANCELLED],
  [ShipmentStatus.DISPATCHED]: [
    ShipmentStatus.IN_TRANSIT,
    ShipmentStatus.OUT_FOR_DELIVERY,
    ShipmentStatus.DELIVERED,
    ShipmentStatus.EXCEPTION,
    ShipmentStatus.CANCELLED,
  ],
  [ShipmentStatus.IN_TRANSIT]: [
    ShipmentStatus.OUT_FOR_DELIVERY,
    ShipmentStatus.DELIVERED,
    ShipmentStatus.EXCEPTION,
  ],
  [ShipmentStatus.OUT_FOR_DELIVERY]: [
    ShipmentStatus.DELIVERED,
    ShipmentStatus.EXCEPTION,
  ],
  [ShipmentStatus.EXCEPTION]: [
    ShipmentStatus.IN_TRANSIT,
    ShipmentStatus.OUT_FOR_DELIVERY,
    ShipmentStatus.DELIVERED,
    ShipmentStatus.CANCELLED,
  ],
  [ShipmentStatus.DELIVERED]: [],
  [ShipmentStatus.CANCELLED]: [],
};

export function normalizeTrackingNumber(tracking: string): string {
  return tracking.trim().toUpperCase().replace(/\s+/g, '');
}

export function buildCarrierTrackingKey(
  carrierCode: string,
  trackingNumber: string | null | undefined,
): string | null {
  if (!trackingNumber?.trim()) return null;
  return `${carrierCode.trim().toUpperCase()}|${normalizeTrackingNumber(trackingNumber)}`;
}

export function isAllowedTrackingUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'https:') return false;
    return TRACKING_URL_ALLOWED_HOSTS.has(parsed.hostname.toLowerCase());
  } catch {
    return false;
  }
}

export function customerMessageForException(
  code: ShipmentExceptionCode,
  override?: string | null,
): string {
  const trimmed = override?.trim();
  if (trimmed && trimmed.length <= 500) return trimmed;
  return SHIPMENT_EXCEPTION_CUSTOMER_MESSAGE[code];
}
