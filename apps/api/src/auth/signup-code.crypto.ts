import { createHmac, hkdfSync, randomInt, timingSafeEqual } from 'node:crypto';

/**
 * TTW-254: helpers for the one-time code that confirms a new sign-up.
 *
 * The code has only 10^6 values, so it is stored as a keyed HMAC, never as a
 * plain hash (which a database read would reverse in seconds).
 */

export const SIGNUP_CODE_DIGITS = 6;

/** Six digits from a CSPRNG, zero-padded. No modulo bias: `randomInt` rejects instead. */
export function generateSignupCode(): string {
  return randomInt(0, 10 ** SIGNUP_CODE_DIGITS)
    .toString()
    .padStart(SIGNUP_CODE_DIGITS, '0');
}

/**
 * The HMAC key. Production requires a dedicated `SIGNUP_CODE_HMAC_KEY` (checked at startup).
 * Elsewhere, when it is not set, a key is derived from the JWT access secret with HKDF and a
 * fixed purpose string, so the raw JWT secret is never used as a key here.
 */
export function resolveSignupCodeKey(env: {
  SIGNUP_CODE_HMAC_KEY?: string;
  JWT_ACCESS_SECRET?: string;
}): Buffer {
  const dedicated = env.SIGNUP_CODE_HMAC_KEY?.trim();
  if (dedicated) return Buffer.from(dedicated, 'utf8');
  const fallback = env.JWT_ACCESS_SECRET?.trim();
  if (!fallback) {
    throw new Error('SIGNUP_CODE_HMAC_KEY is not configured');
  }
  return Buffer.from(
    hkdfSync(
      'sha256',
      Buffer.from(fallback, 'utf8'),
      Buffer.alloc(0),
      'ttw:signup-code:v1',
      32,
    ),
  );
}

/** HMAC-SHA256 of `v1|<email>|<code>`, hex. The email is the normalised row key. */
export function hashSignupCode(
  key: Buffer,
  email: string,
  code: string,
): string {
  return createHmac('sha256', key)
    .update(`v1|${email}|${code}`, 'utf8')
    .digest('hex');
}

/** Constant-time comparison of two hex digests of the same length. */
export function signupCodeMatches(
  key: Buffer,
  email: string,
  code: string,
  storedHash: string,
): boolean {
  const expected = Buffer.from(hashSignupCode(key, email, code), 'hex');
  const stored = Buffer.from(storedHash, 'hex');
  return expected.length === stored.length && timingSafeEqual(expected, stored);
}
