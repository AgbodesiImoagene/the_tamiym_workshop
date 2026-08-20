/** Interim design-share policy version (TTW-026). */
export const DESIGN_SHARE_POLICY_VERSION =
  'design-share-policy/v1-interim-2026-08-20';

/** Default link lifetime when the client omits `ttlDays`. */
export const DESIGN_SHARE_DEFAULT_TTL_DAYS = 7;

/** Approved bounded lifetimes (days). */
export const DESIGN_SHARE_ALLOWED_TTL_DAYS = [1, 7, 30] as const;

export type DesignShareTtlDays = (typeof DESIGN_SHARE_ALLOWED_TTL_DAYS)[number];

/** Env key for the public SPA origin used in share URLs. */
export const DESIGN_SHARE_PUBLIC_ORIGIN_ENV = 'DESIGN_SHARE_PUBLIC_ORIGIN';
