import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';

/** SHA-256 hex digest of a refresh credential (never store plaintext). */
export function hashRefreshToken(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('hex');
}

/** Mint a high-entropy refresh credential (returned once to the client). */
export function mintRefreshToken(): string {
  return randomBytes(32).toString('hex');
}

/**
 * Coarse device label from User-Agent — truncated, never used as a fingerprint
 * or uniqueness key.
 */
export function deviceLabelFromUserAgent(
  userAgent: string | undefined,
): string | null {
  if (!userAgent) return null;
  const trimmed = userAgent.trim().slice(0, 120);
  return trimmed.length > 0 ? trimmed : null;
}

/** Constant-time compare of two hex digests (same length assumed). */
export function safeEqualHex(a: string, b: string): boolean {
  try {
    const bufA = Buffer.from(a, 'hex');
    const bufB = Buffer.from(b, 'hex');
    if (bufA.length === 0 || bufA.length !== bufB.length) return false;
    return timingSafeEqual(bufA, bufB);
  } catch {
    return false;
  }
}
