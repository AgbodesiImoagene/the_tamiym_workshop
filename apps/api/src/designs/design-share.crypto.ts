import { createHash, randomBytes } from 'node:crypto';

/** SHA-256 hex digest of a design-share bearer token (never store plaintext). */
export function hashDesignShareToken(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('hex');
}

/** Mint a high-entropy share bearer (returned once to the owner). */
export function mintDesignShareToken(): string {
  return randomBytes(32).toString('base64url');
}
