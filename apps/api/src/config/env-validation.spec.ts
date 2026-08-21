import { parseOriginEntries, validateEnv } from './env-validation';

function omit<T extends Record<string, unknown>>(
  config: T,
  key: keyof T,
): Record<string, unknown> {
  const clone: Record<string, unknown> = { ...config };
  delete clone[key as string];
  return clone;
}

describe('env-validation', () => {
  const originalEnv = { ...process.env };
  const originalNodeEnv = process.env.NODE_ENV;

  const validBaseConfig = {
    DATABASE_URL: 'postgres://localhost:5432/db',
    JWT_ACCESS_SECRET: 'a-real-access-secret',
    JWT_REFRESH_SECRET: 'a-real-refresh-secret',
    MFA_TOTP_ENCRYPTION_KEY: 'zghUm6jv4icb3WT8MzKea1lMrsgir7rONaShtv10zdQ=',
  };

  afterEach(() => {
    process.env = { ...originalEnv };
    process.env.NODE_ENV = originalNodeEnv;
  });

  describe('parseOriginEntries', () => {
    it('parses a single valid origin', () => {
      expect(parseOriginEntries('http://localhost:3000')).toEqual([
        'http://localhost:3000',
      ]);
    });

    it('parses multiple comma-separated origins and trims whitespace', () => {
      expect(
        parseOriginEntries(' http://localhost:3000 , http://localhost:3003 '),
      ).toEqual(['http://localhost:3000', 'http://localhost:3003']);
    });

    it('normalizes an origin that includes a path or trailing slash', () => {
      expect(parseOriginEntries('http://localhost:3000/some/path')).toEqual([
        'http://localhost:3000',
      ]);
    });

    it('drops blank entries produced by stray commas', () => {
      expect(parseOriginEntries('http://localhost:3000,,')).toEqual([
        'http://localhost:3000',
      ]);
    });

    it('drops unparsable entries and keeps valid ones', () => {
      expect(parseOriginEntries('not-a-url, http://localhost:3000')).toEqual([
        'http://localhost:3000',
      ]);
    });

    it('returns an empty array when every entry is invalid', () => {
      expect(parseOriginEntries('not-a-url, also not one')).toEqual([]);
    });

    it('returns an empty array for a blank string', () => {
      expect(parseOriginEntries('')).toEqual([]);
    });
  });

  describe('validateEnv', () => {
    it('skips all validation under NODE_ENV=test, even with missing vars', () => {
      process.env.NODE_ENV = 'test';
      expect(validateEnv({})).toEqual({});
    });

    describe('non-test, non-production (e.g. development)', () => {
      beforeEach(() => {
        process.env.NODE_ENV = 'development';
      });

      it('passes through a config with all required vars present', () => {
        expect(validateEnv(validBaseConfig)).toEqual(validBaseConfig);
      });

      it('throws when a required var is missing', () => {
        expect(() =>
          validateEnv(omit(validBaseConfig, 'DATABASE_URL')),
        ).toThrow('Missing required environment variable: DATABASE_URL');
      });

      it('throws when a required var is blank', () => {
        expect(() =>
          validateEnv({ ...validBaseConfig, JWT_ACCESS_SECRET: '   ' }),
        ).toThrow('Missing required environment variable: JWT_ACCESS_SECRET');
      });

      it('throws when a required var is a forbidden placeholder value', () => {
        expect(() =>
          validateEnv({ ...validBaseConfig, JWT_ACCESS_SECRET: 'secret' }),
        ).toThrow(
          'Environment variable JWT_ACCESS_SECRET must be set to a secure value, not a placeholder',
        );
      });

      it('does not require the production-only Origin allowlist vars', () => {
        expect(validateEnv(validBaseConfig)).toEqual(validBaseConfig);
      });

      it('throws when MFA_TOTP_ENCRYPTION_KEY is missing', () => {
        expect(() =>
          validateEnv(omit(validBaseConfig, 'MFA_TOTP_ENCRYPTION_KEY')),
        ).toThrow(
          'Missing required environment variable: MFA_TOTP_ENCRYPTION_KEY',
        );
      });

      it('throws when MFA_TOTP_ENCRYPTION_KEY is not 32 decoded bytes', () => {
        expect(() =>
          validateEnv({
            ...validBaseConfig,
            MFA_TOTP_ENCRYPTION_KEY: 'dG9vLXNob3J0',
          }),
        ).toThrow(
          'Environment variable MFA_TOTP_ENCRYPTION_KEY must decode to exactly 32 bytes',
        );
      });
    });

    describe('production', () => {
      const validProductionConfig = {
        ...validBaseConfig,
        AUTH_ADMIN_ORIGINS: 'https://admin.example.com',
        AUTH_CUSTOMER_ORIGINS: 'https://shop.example.com',
        CLAMAV_HOST: 'clamav.internal',
        DESIGN_SHARE_PUBLIC_ORIGIN: 'https://app.example.com',
      };

      beforeEach(() => {
        process.env.NODE_ENV = 'production';
      });

      it('passes through a fully valid production config', () => {
        expect(validateEnv(validProductionConfig)).toEqual(
          validProductionConfig,
        );
      });

      it('throws when CLAMAV_HOST is missing', () => {
        expect(() =>
          validateEnv(omit(validProductionConfig, 'CLAMAV_HOST')),
        ).toThrow(
          'Missing required production environment variable: CLAMAV_HOST',
        );
      });

      it('throws when DESIGN_SHARE_PUBLIC_ORIGIN is invalid', () => {
        expect(() =>
          validateEnv({
            ...validProductionConfig,
            DESIGN_SHARE_PUBLIC_ORIGIN: 'not-a-url',
          }),
        ).toThrow(
          'Environment variable DESIGN_SHARE_PUBLIC_ORIGIN must be a valid http(s) absolute URL',
        );
      });

      it('throws when VIRUS_SCANNER=deterministic in production', () => {
        expect(() =>
          validateEnv({
            ...validProductionConfig,
            VIRUS_SCANNER: 'deterministic',
          }),
        ).toThrow(/deterministic is forbidden in production/);
      });

      it('throws when VIRUS_SCANNER=unavailable in production', () => {
        expect(() =>
          validateEnv({
            ...validProductionConfig,
            VIRUS_SCANNER: 'unavailable',
          }),
        ).toThrow(/unavailable is forbidden in production/);
      });

      it('throws when PAYOUT_BANK_RESOLUTION_MODE=stub in production', () => {
        expect(() =>
          validateEnv({
            ...validProductionConfig,
            PAYOUT_BANK_RESOLUTION_MODE: 'stub',
          }),
        ).toThrow(
          'PAYOUT_BANK_RESOLUTION_MODE=stub is forbidden in production; use live',
        );
      });

      it('throws when AUTH_ADMIN_ORIGINS is missing', () => {
        expect(() =>
          validateEnv(omit(validProductionConfig, 'AUTH_ADMIN_ORIGINS')),
        ).toThrow(
          'Missing required production environment variable: AUTH_ADMIN_ORIGINS',
        );
      });

      it('throws when AUTH_CUSTOMER_ORIGINS is missing', () => {
        expect(() =>
          validateEnv(omit(validProductionConfig, 'AUTH_CUSTOMER_ORIGINS')),
        ).toThrow(
          'Missing required production environment variable: AUTH_CUSTOMER_ORIGINS',
        );
      });

      it('throws when AUTH_ADMIN_ORIGINS is blank', () => {
        expect(() =>
          validateEnv({ ...validProductionConfig, AUTH_ADMIN_ORIGINS: '   ' }),
        ).toThrow(
          'Missing required production environment variable: AUTH_ADMIN_ORIGINS',
        );
      });

      it('throws when AUTH_CUSTOMER_ORIGINS is blank', () => {
        expect(() =>
          validateEnv({
            ...validProductionConfig,
            AUTH_CUSTOMER_ORIGINS: '',
          }),
        ).toThrow(
          'Missing required production environment variable: AUTH_CUSTOMER_ORIGINS',
        );
      });

      it('throws when AUTH_ADMIN_ORIGINS contains no valid origin URL', () => {
        expect(() =>
          validateEnv({
            ...validProductionConfig,
            AUTH_ADMIN_ORIGINS: 'not-a-url',
          }),
        ).toThrow(
          'Environment variable AUTH_ADMIN_ORIGINS must contain at least one valid origin URL',
        );
      });

      it('throws when AUTH_CUSTOMER_ORIGINS contains no valid origin URL', () => {
        expect(() =>
          validateEnv({
            ...validProductionConfig,
            AUTH_CUSTOMER_ORIGINS: 'not-a-url, also-not-one',
          }),
        ).toThrow(
          'Environment variable AUTH_CUSTOMER_ORIGINS must contain at least one valid origin URL',
        );
      });

      it('still enforces the base required vars and placeholder check', () => {
        expect(() =>
          validateEnv({
            ...validProductionConfig,
            JWT_REFRESH_SECRET: 'secret',
          }),
        ).toThrow(
          'Environment variable JWT_REFRESH_SECRET must be set to a secure value, not a placeholder',
        );
      });

      it('accepts multiple comma-separated origins for a surface allowlist', () => {
        const config = {
          ...validProductionConfig,
          AUTH_ADMIN_ORIGINS:
            'https://admin.example.com,https://admin2.example.com',
        };
        expect(validateEnv(config)).toEqual(config);
      });
    });
  });
});
