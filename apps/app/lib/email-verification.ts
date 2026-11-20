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

/** Checkout refusal wording: the order was not placed; the banner above keeps its own sentence. */
export const EMAIL_NOT_VERIFIED_CHECKOUT_MESSAGE =
  'Your order has not been placed because your email is not verified yet. Open the link we emailed you, then place the order again.';
