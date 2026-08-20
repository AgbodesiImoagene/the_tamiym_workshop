import {
  decodeMfaEncryptionKey,
  encryptTotpSecret,
  decryptTotpSecret,
  generateRecoveryCodes,
  hashRecoveryCode,
  normalizeRecoveryCode,
} from './admin-mfa.crypto';
import {
  generateTotpCode,
  mintTotpSecret,
  verifyTotpCode,
} from './admin-mfa.totp';

describe('admin-mfa.crypto', () => {
  const key = decodeMfaEncryptionKey(Buffer.alloc(32, 7).toString('base64'));

  it('round-trips AES-256-GCM secrets', () => {
    const secret = 'JBSWY3DPEHPK3PXP';
    const enc = encryptTotpSecret(secret, key);
    expect(decryptTotpSecret(enc.ciphertext, enc.nonce, key)).toBe(secret);
  });

  it('rejects undersized encryption keys', () => {
    expect(() =>
      decodeMfaEncryptionKey(Buffer.alloc(16).toString('base64')),
    ).toThrow(/32 bytes/);
  });

  it('hashes recovery codes after normalization', () => {
    const a = hashRecoveryCode('abcd-ef01');
    const b = hashRecoveryCode('ABCD EF01');
    expect(a).toBe(b);
    expect(normalizeRecoveryCode('ab cd')).toBe('ABCD');
  });

  it('mints unique high-entropy recovery codes', () => {
    const codes = generateRecoveryCodes(10);
    expect(codes).toHaveLength(10);
    expect(new Set(codes).size).toBe(10);
    for (const code of codes) {
      expect(code.replace(/-/g, '')).toHaveLength(32);
    }
  });
});

describe('admin-mfa.totp', () => {
  it('verifies a freshly generated TOTP', () => {
    const secret = mintTotpSecret();
    const token = generateTotpCode(secret);
    expect(verifyTotpCode(token, secret)).toBe(true);
    expect(verifyTotpCode('000000', secret)).toBe(false);
  });
});
