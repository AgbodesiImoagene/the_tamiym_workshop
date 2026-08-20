import {
  deviceLabelFromUserAgent,
  hashRefreshToken,
  mintRefreshToken,
  safeEqualHex,
} from './auth-session.crypto';

describe('auth-session.crypto', () => {
  it('hashes refresh tokens deterministically with sha256 hex', () => {
    const token = 'abc123';
    expect(hashRefreshToken(token)).toBe(hashRefreshToken(token));
    expect(hashRefreshToken(token)).toHaveLength(64);
    expect(hashRefreshToken(token)).not.toBe(token);
  });

  it('mints unique high-entropy refresh tokens', () => {
    const a = mintRefreshToken();
    const b = mintRefreshToken();
    expect(a).toHaveLength(64);
    expect(b).toHaveLength(64);
    expect(a).not.toBe(b);
  });

  it('truncates coarse device labels and ignores empty UA', () => {
    expect(deviceLabelFromUserAgent(undefined)).toBeNull();
    expect(deviceLabelFromUserAgent('   ')).toBeNull();
    expect(deviceLabelFromUserAgent('Mozilla/5.0')).toBe('Mozilla/5.0');
    const long = 'x'.repeat(200);
    expect(deviceLabelFromUserAgent(long)?.length).toBe(120);
  });

  it('compares digests in constant time', () => {
    const a = hashRefreshToken('one');
    const b = hashRefreshToken('one');
    const c = hashRefreshToken('two');
    expect(safeEqualHex(a, b)).toBe(true);
    expect(safeEqualHex(a, c)).toBe(false);
    expect(safeEqualHex('zz', a)).toBe(false);
  });
});
