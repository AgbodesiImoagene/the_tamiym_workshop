/** Deterministic e2e seed identifiers — keep in sync with apps/api/scripts/seed-e2e-dummy-data.ts */

export const E2E_CAMPAIGN_SLUG_ACTIVE = 'campus-outreach-drive-e2e';
export const E2E_CAMPAIGN_SLUG_REVIEW = 'choir-fundraiser-e2e';
export const E2E_PRODUCT_TEE_SLUG = 'classic-tee-e2e';
export const E2E_PRODUCT_HOODIE_SLUG = 'campus-hoodie-e2e';
export const E2E_ORDER_PAID_ID = 'e2e-order-paid-campaign';

/**
 * Deactivated geo rows (TTW-209), for the admin zone area picker. Both are
 * inactive, so the public geo lists never return them. The LGA belongs to the
 * seeded state Lagos (`LA`), whose active LGA is Ikeja.
 */
export const E2E_DORMANT_STATE_NAME = 'E2E Dormant State';
export const E2E_DORMANT_LGA_NAME = 'E2E Dormant LGA';
export const E2E_ACTIVE_STATE_NAME = 'Lagos';
export const E2E_ACTIVE_LGA_NAME = 'Ikeja';
