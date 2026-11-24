import {
  generateSignupCode,
  hashSignupCode,
  resolveSignupCodeKey,
  signupCodeMatches,
} from './signup-code.crypto';

describe('signup code crypto (TTW-254)', () => {
  const key = Buffer.from('a-test-key-that-is-long-enough-0123456789', 'utf8');

  describe('generateSignupCode', () => {
    it('returns six digits, zero-padded, and does not repeat a fixed value', () => {
      const seen = new Set<string>();
      for (let i = 0; i < 200; i += 1) {
        const code = generateSignupCode();
        expect(code).toMatch(/^\d{6}$/);
        seen.add(code);
      }
      expect(seen.size).toBeGreaterThan(150);
    });
  });

  describe('hashSignupCode / signupCodeMatches', () => {
    it('accepts the right code for the right address', () => {
      const hash = hashSignupCode(key, 'a@example.com', '123456');
      expect(signupCodeMatches(key, 'a@example.com', '123456', hash)).toBe(
        true,
      );
    });

    it('refuses a wrong code, another address and another key', () => {
      const hash = hashSignupCode(key, 'a@example.com', '123456');
      expect(signupCodeMatches(key, 'a@example.com', '654321', hash)).toBe(
        false,
      );
      expect(signupCodeMatches(key, 'b@example.com', '123456', hash)).toBe(
        false,
      );
      expect(
        signupCodeMatches(
          Buffer.from('another-key-another-key-another-key-00', 'utf8'),
          'a@example.com',
          '123456',
          hash,
        ),
      ).toBe(false);
    });

    it('is not a plain hash of the code: a read of the stored value cannot be reversed without the key', () => {
      const hash = hashSignupCode(key, 'a@example.com', '123456');
      expect(hash).toMatch(/^[0-9a-f]{64}$/);
      expect(hash).not.toBe(
        '8d969eef6ecad3c29a3a629280e686cf0c3f5d5a86aff3ca12020c923adc6c92',
      );
    });

    it('refuses a stored value of the wrong length instead of throwing', () => {
      expect(signupCodeMatches(key, 'a@example.com', '123456', 'abcd')).toBe(
        false,
      );
    });
  });

  describe('resolveSignupCodeKey', () => {
    it('uses the dedicated key when set', () => {
      expect(
        resolveSignupCodeKey({
          SIGNUP_CODE_HMAC_KEY: 'dedicated-key',
          JWT_ACCESS_SECRET: 'jwt-secret',
        }).toString('utf8'),
      ).toBe('dedicated-key');
    });

    it('derives a different key from the JWT secret, never the raw secret', () => {
      const derived = resolveSignupCodeKey({ JWT_ACCESS_SECRET: 'jwt-secret' });
      expect(derived.length).toBe(32);
      expect(derived.toString('utf8')).not.toBe('jwt-secret');
      expect(
        resolveSignupCodeKey({ JWT_ACCESS_SECRET: 'jwt-secret' }).equals(
          derived,
        ),
      ).toBe(true);
    });

    it('throws when no key can be found', () => {
      expect(() => resolveSignupCodeKey({})).toThrow(
        'SIGNUP_CODE_HMAC_KEY is not configured',
      );
    });
  });
});
