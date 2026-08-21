/** TTW-030 interim organiser onboarding policy + terms versions. */

export const ORGANIZER_ONBOARDING_POLICY_VERSION =
  'organiser-onboarding-policy/v1-interim-2026-08-21';

export const ORGANIZER_TERMS_VERSION = 'organiser-terms/v1-interim-2026-08-21';

export const ORGANISATION_NAME_MIN = 2;
export const ORGANISATION_NAME_MAX = 120;
export const INTENDED_USE_MIN = 20;
export const INTENDED_USE_MAX = 2000;
export const CUSTOMER_VISIBLE_REASON_MIN = 10;
export const CUSTOMER_VISIBLE_REASON_MAX = 500;
export const INTERNAL_NOTES_MAX = 2000;
export const OVERRIDE_REASON_MIN = 10;
export const OVERRIDE_REASON_MAX = 500;

/** NotificationOutbox.eventName values (stable; no free-text labels). */
export const OUTBOX_EVENT_ORGANIZER_APPLICATION_APPROVED =
  'organiser.application.approved';
export const OUTBOX_EVENT_ORGANIZER_APPLICATION_REJECTED =
  'organiser.application.rejected';

const INTERNAL_LEAK_MARKERS = [
  'internal note',
  'internalnotes',
  'category:',
  'maxscore',
  'openai',
  'moderation score',
] as const;

/**
 * True when admin-supplied customerVisibleReason is safe to show applicants
 * (no scores, taxonomy, or internal-note markers).
 */
export function isSafeCustomerVisibleReason(text: string): boolean {
  if (
    text.length < CUSTOMER_VISIBLE_REASON_MIN ||
    text.length > CUSTOMER_VISIBLE_REASON_MAX
  ) {
    return false;
  }
  const lower = text.toLowerCase();
  if (/\b\d+\.\d+\b/.test(text)) {
    return false;
  }
  for (const marker of INTERNAL_LEAK_MARKERS) {
    if (lower.includes(marker)) {
      return false;
    }
  }
  return true;
}

/** Sanitize rejection copy; fall back to a generic safe message when unsafe. */
export function sanitizeCustomerVisibleReason(raw: string): string {
  const trimmed = raw.trim().replace(/\s+/g, ' ');
  if (!isSafeCustomerVisibleReason(trimmed)) {
    return 'Your organiser application was not approved. You may update your profile and reapply.';
  }
  return trimmed;
}
