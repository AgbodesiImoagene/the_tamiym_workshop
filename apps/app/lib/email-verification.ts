/**
 * TTW-090: the API refuses an order from an account whose email is not verified
 * with this stable code (403). The API stays the authority; the app only explains.
 */
export const EMAIL_NOT_VERIFIED = 'EMAIL_NOT_VERIFIED';

export const EMAIL_NOT_VERIFIED_MESSAGE =
  'Please verify your email before you place an order. Check your inbox for the link, or ask for a new one.';

export function isEmailNotVerified(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    (error as { code?: unknown }).code === EMAIL_NOT_VERIFIED
  );
}
