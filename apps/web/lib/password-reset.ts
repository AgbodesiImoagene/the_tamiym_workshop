/**
 * TTW-089: rules shared by the forgot-password and reset-password pages.
 * Kept out of the components so they can be unit-tested (web Jest runs in node).
 */
import { z } from 'zod';

/**
 * The symbols the API's `@IsStrongPassword` (validator.js) counts. "Any non-alphanumeric
 * character" is wider: it would accept `€` or an emoji that the API then refuses.
 */
const API_SYMBOL = /[-#!$@£%^&*()_+|~=`{}[\]:";'<>?,./\\ ]/;

export const forgotPasswordSchema = z.object({
  email: z.email('Enter a valid email address'),
});

export type ForgotPasswordValues = z.infer<typeof forgotPasswordSchema>;

/** Same rules as the API `ResetPasswordDto` and the register page. */
export const resetPasswordSchema = z
  .object({
    newPassword: z
      .string()
      .min(8, 'Password must be at least 8 characters')
      .regex(/[A-Z]/, 'Include at least one uppercase letter')
      .regex(/[a-z]/, 'Include at least one lowercase letter')
      .regex(/[0-9]/, 'Include at least one number')
      .regex(API_SYMBOL, 'Include at least one symbol'),
    confirmPassword: z.string().min(1, 'Please confirm your password'),
  })
  .refine((values) => values.newPassword === values.confirmPassword, {
    path: ['confirmPassword'],
    message: 'Passwords do not match',
  });

export type ResetPasswordValues = z.infer<typeof resetPasswordSchema>;

/**
 * Shown after every successful request, whether or not an account exists, so the
 * page never reveals which emails are registered. Never use the server wording.
 */
export const FORGOT_PASSWORD_SUCCESS_MESSAGE =
  'If an account exists with this email, a password reset link is on its way. It stays valid for one hour.';

/** Stable code of the API for an unknown, expired or used reset token. */
export const INVALID_RESET_TOKEN_CODE = 'INVALID_RESET_TOKEN';

export type ResetErrorKind = 'invalid-link' | 'password-rejected' | 'rate-limited' | 'unexpected';

/** How an API failure is shown. The raw message is never displayed or logged. */
export function classifyResetError(error: unknown): ResetErrorKind {
  const statusCode =
    typeof error === 'object' && error !== null && 'statusCode' in error
      ? (error as { statusCode?: unknown }).statusCode
      : undefined;
  if (statusCode === 400) {
    // The API answers 400 both for a bad token and for a password it refuses.
    // Only the stable code marks the first; the wording is not relied on.
    const code =
      typeof error === 'object' && error !== null && 'code' in error
        ? (error as { code?: unknown }).code
        : undefined;
    return code === INVALID_RESET_TOKEN_CODE ? 'invalid-link' : 'password-rejected';
  }
  if (statusCode === 429) return 'rate-limited';
  return 'unexpected';
}

export const RESET_ERROR_MESSAGES: Record<Exclude<ResetErrorKind, 'invalid-link'>, string> = {
  'password-rejected':
    'This password was not accepted. Use at least 8 characters with upper and lower case letters, a number and a symbol.',
  'rate-limited': 'Too many attempts. Please wait a few minutes and try again.',
  unexpected: 'Something went wrong. Please try again.',
};
