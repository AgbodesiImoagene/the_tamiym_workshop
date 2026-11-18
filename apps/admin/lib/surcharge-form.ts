import { z } from 'zod';

/** Largest value the API accepts (`Decimal(10, 2)`). Keep in sync with `MAX_SURCHARGE_AMOUNT`. */
export const MAX_SURCHARGE_AMOUNT = 99_999_999.99;

/**
 * One surcharge amount typed by an admin (TTW-094): digits with at most 2
 * decimals, between 0 and the column limit. The API checks the same rules.
 */
export const surchargeFormSchema = z.object({
  amount: z
    .string()
    .trim()
    .min(1, 'Enter an amount, or use Remove to clear the surcharge.')
    .regex(
      /^\d+(\.\d{1,2})?$/,
      'Use digits only, with at most 2 decimals (for example 500 or 1000.50).'
    )
    .refine((value) => Number(value) <= MAX_SURCHARGE_AMOUNT, {
      message: 'This amount is too large.',
    }),
});

export type SurchargeFormValues = z.infer<typeof surchargeFormSchema>;

/** Message shown to the admin for a failed surcharge request. */
export function describeSurchargeError(error: unknown): string {
  const status =
    error && typeof error === 'object' && 'statusCode' in error
      ? (error as { statusCode?: number }).statusCode
      : undefined;
  if (status === 401) return 'Your session has expired. Sign in again to continue.';
  if (status === 403) return 'You do not have permission to change surcharges.';
  if (status === 404) return 'This item no longer exists. Refresh the page and try again.';
  if (error && typeof error === 'object' && 'message' in error) {
    const message = String((error as { message: unknown }).message);
    if (message) return message;
  }
  return 'Could not save the surcharge. Try again.';
}
