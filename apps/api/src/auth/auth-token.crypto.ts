import { createHash, randomBytes } from 'node:crypto';

/**
 * SHA-256 hex digest of a password-reset or email-verification token
 * (TTW-083). Only this digest is stored; the raw token lives in the emailed
 * link alone, so a database read cannot produce a working link.
 */
export function hashAuthToken(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('hex');
}

/** Mint a high-entropy single-use token (sent once, by email). */
export function mintAuthToken(): string {
  return randomBytes(32).toString('hex');
}
