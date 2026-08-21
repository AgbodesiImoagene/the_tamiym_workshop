/**
 * Interim organiser campaign-authoring policy (TTW-035).
 * Snapshotted onto owner detail / preview responses; do not rewrite silently.
 */
export const ORGANISER_CAMPAIGN_AUTHORING_POLICY_VERSION =
  'organiser-campaign-authoring/v1-interim-2026-08-21';

/** Non-promising floor guidance shown to organisers (never exposes cost basis). */
export const CAMPAIGN_PRICE_FLOOR_GUIDANCE =
  'Set a positive NGN selling price at or above the current platform minimum for this product and design. Final quote and order pricing remain authoritative and may vary by options, discounts, shipping, and tax.';

export const CampaignAuthoringErrorCode = {
  STALE_REVISION: 'CAMPAIGN_STALE_REVISION',
  NOT_DRAFT: 'CAMPAIGN_NOT_DRAFT',
  TITLE_INVALID: 'CAMPAIGN_TITLE_INVALID',
  SLUG_INVALID: 'CAMPAIGN_SLUG_INVALID',
  SLUG_TAKEN: 'CAMPAIGN_SLUG_TAKEN',
  GOAL_INVALID: 'CAMPAIGN_GOAL_INVALID',
  DATE_ORDER_INVALID: 'CAMPAIGN_DATE_ORDER_INVALID',
  PRODUCT_NOT_FOUND: 'CAMPAIGN_PRODUCT_NOT_FOUND',
  DESIGN_NOT_FOUND: 'CAMPAIGN_DESIGN_NOT_FOUND',
  DESIGN_NOT_OWNED: 'CAMPAIGN_DESIGN_NOT_OWNED',
  DESIGN_PRODUCT_MISMATCH: 'CAMPAIGN_DESIGN_PRODUCT_MISMATCH',
  OFFER_DUPLICATE: 'CAMPAIGN_OFFER_DUPLICATE',
  OFFER_NOT_FOUND: 'CAMPAIGN_OFFER_NOT_FOUND',
  PRICE_INVALID: 'CAMPAIGN_PRICE_INVALID',
  PRICE_BELOW_FLOOR: 'CAMPAIGN_PRICE_BELOW_FLOOR',
  SUBMIT_MISSING_TITLE: 'CAMPAIGN_SUBMIT_MISSING_TITLE',
  SUBMIT_NO_OFFERS: 'CAMPAIGN_SUBMIT_NO_OFFERS',
  SUBMIT_OFFER_PRICE_INVALID: 'CAMPAIGN_SUBMIT_OFFER_PRICE_INVALID',
} as const;

export type CampaignAuthoringErrorCode =
  (typeof CampaignAuthoringErrorCode)[keyof typeof CampaignAuthoringErrorCode];
