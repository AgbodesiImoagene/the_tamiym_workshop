import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
  timingSafeEqual,
} from 'node:crypto';

/** Current application encryption key version (bump when rotating keys). */
export const MFA_TOTP_KEY_VERSION = 1;

const AES_ALGORITHM = 'aes-256-gcm';
const NONCE_BYTES = 12;
const AUTH_TAG_BYTES = 16;
const KEY_BYTES = 32;

export type EncryptedTotpSecret = {
  ciphertext: string;
  nonce: string;
  keyVersion: number;
};

/**
 * Decode and validate `MFA_TOTP_ENCRYPTION_KEY` (standard base64 of exactly
 * 32 bytes for AES-256-GCM).
 */
export function decodeMfaEncryptionKey(raw: string | undefined): Buffer {
  if (!raw || raw.trim() === '') {
    throw new Error('MFA_TOTP_ENCRYPTION_KEY is required');
  }
  let key: Buffer;
  try {
    key = Buffer.from(raw.trim(), 'base64');
  } catch {
    throw new Error(
      'MFA_TOTP_ENCRYPTION_KEY must be a valid base64-encoded 32-byte key',
    );
  }
  if (key.length !== KEY_BYTES) {
    throw new Error(
      `MFA_TOTP_ENCRYPTION_KEY must decode to ${KEY_BYTES} bytes (got ${key.length})`,
    );
  }
  return key;
}

/** Encrypt a TOTP shared secret with AES-256-GCM. */
export function encryptTotpSecret(
  plaintextSecret: string,
  key: Buffer,
  keyVersion: number = MFA_TOTP_KEY_VERSION,
): EncryptedTotpSecret {
  const nonce = randomBytes(NONCE_BYTES);
  const cipher = createCipheriv(AES_ALGORITHM, key, nonce);
  const encrypted = Buffer.concat([
    cipher.update(plaintextSecret, 'utf8'),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  // ciphertext || authTag (both base64 as a single field)
  const ciphertext = Buffer.concat([encrypted, tag]).toString('base64');
  return {
    ciphertext,
    nonce: nonce.toString('base64'),
    keyVersion,
  };
}

/** Decrypt a TOTP shared secret previously produced by `encryptTotpSecret`. */
export function decryptTotpSecret(
  ciphertextB64: string,
  nonceB64: string,
  key: Buffer,
): string {
  const packed = Buffer.from(ciphertextB64, 'base64');
  if (packed.length <= AUTH_TAG_BYTES) {
    throw new Error('Invalid MFA secret ciphertext');
  }
  const encrypted = packed.subarray(0, packed.length - AUTH_TAG_BYTES);
  const tag = packed.subarray(packed.length - AUTH_TAG_BYTES);
  const nonce = Buffer.from(nonceB64, 'base64');
  if (nonce.length !== NONCE_BYTES) {
    throw new Error('Invalid MFA secret nonce');
  }
  const decipher = createDecipheriv(AES_ALGORITHM, key, nonce);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString(
    'utf8',
  );
}

/** SHA-256 hex digest of a recovery code (normalized). */
export function hashRecoveryCode(code: string): string {
  return createHash('sha256')
    .update(normalizeRecoveryCode(code), 'utf8')
    .digest('hex');
}

/** Normalize recovery codes for compare/hash (strip separators, upper-case). */
export function normalizeRecoveryCode(code: string): string {
  return code.replace(/[\s-]+/g, '').toUpperCase();
}

/**
 * Mint 10 single-use recovery codes (XXXX-XXXX hex groups). Callers must
 * show plaintext once and persist only `hashRecoveryCode` digests.
 */
export function generateRecoveryCodes(count = 10): string[] {
  const codes: string[] = [];
  for (let i = 0; i < count; i += 1) {
    const raw = randomBytes(4).toString('hex').toUpperCase();
    codes.push(`${raw.slice(0, 4)}-${raw.slice(4)}`);
  }
  return codes;
}

/** Constant-time compare of two hex digests. */
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
