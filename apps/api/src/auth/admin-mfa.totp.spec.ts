import {
  buildTotpUri,
  generateTotpCode,
  mintTotpSecret,
  verifyTotpCode,
} from './admin-mfa.totp';

describe('admin-mfa.totp', () => {
  it('verifies the current TOTP code', () => {
    const secret = mintTotpSecret();
    const token = generateTotpCode(secret);
    expect(verifyTotpCode(token, secret)).toBe(true);
  });

  it('rejects wrong codes', () => {
    const secret = mintTotpSecret();
    expect(verifyTotpCode('000000', secret)).toBe(false);
    expect(verifyTotpCode('abcdef', secret)).toBe(false);
  });

  it('builds an otpauth URI', () => {
    const secret = mintTotpSecret();
    expect(buildTotpUri(secret, 'admin@example.com')).toMatch(
      /^otpauth:\/\/totp\//,
    );
  });
});
