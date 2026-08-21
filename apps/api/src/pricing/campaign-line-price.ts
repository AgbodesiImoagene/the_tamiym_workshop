import { roundToMinor } from './currency-rounding';

/**
 * Interim public campaign-offer policy (TTW-031).
 * Snapshotted onto public fundraiser responses; do not rewrite historical clients silently.
 */
export const PUBLIC_CAMPAIGN_OFFER_POLICY_VERSION =
  'public-campaign-offer/v1-interim-2026-08-21';

/** UI / OpenAPI copy for display amounts on the public offer. */
export const PUBLIC_CAMPAIGN_PRICE_DISCLOSURE =
  'before discounts, shipping and VAT';

/**
 * Shared campaign line-price formula used by public offer display and
 * authenticated campaign quotes (pre-discount merchandise unit).
 *
 * Campaign buyer price = campaign base + option upcharges.
 * Discounts, shipping, VAT, bulk, and view surcharges are applied later by the quote pipeline.
 */
export function resolveCampaignLinePrice(
  unitBasePrice: number,
  optionValueUpcharge: number,
  currency: string,
): {
  unitBasePrice: number;
  optionValueUpcharge: number;
  /** Merchandise unit before campaign discounts (display / quote pre-discount). */
  unitBeforeDiscount: number;
} {
  const base = roundToMinor(unitBasePrice, currency);
  const upcharge = roundToMinor(optionValueUpcharge, currency);
  return {
    unitBasePrice: base,
    optionValueUpcharge: upcharge,
    unitBeforeDiscount: roundToMinor(base + upcharge, currency),
  };
}
