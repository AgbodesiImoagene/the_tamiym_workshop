/** Interim privacy policy version applied to new DSAR requests (TTW-025). */
export const PRIVACY_POLICY_VERSION = 'privacy-policy/v1-interim-2026-08-20';

/** Export download window after request completion. */
export const PRIVACY_EXPORT_TTL_MS = 15 * 60 * 1000;

export const PRIVACY_OPEN_OBLIGATIONS = 'PRIVACY_OPEN_OBLIGATIONS' as const;

/** OAuth-only (or password-less) accounts must set a password before DSAR mutations. */
export const PRIVACY_PASSWORD_REQUIRED = 'PRIVACY_PASSWORD_REQUIRED' as const;
