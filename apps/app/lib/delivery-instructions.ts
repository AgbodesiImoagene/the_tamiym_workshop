// TTW-198: optional delivery instructions on an address, shared by the settings and checkout forms.
export const DELIVERY_INSTRUCTIONS_MAX_LENGTH = 500;

/**
 * What to send as `instructions` for an address form (TTW-198): the trimmed text; null
 * when the customer emptied instructions that were saved (the API keeps the saved value
 * when the field is absent); nothing when there were none and none were typed.
 */
export function instructionsPayload(
  typed: string,
  saved: string | null | undefined
): { instructions?: string | null } {
  const text = typed.trim();
  if (text) return { instructions: text };
  return saved ? { instructions: null } : {};
}
