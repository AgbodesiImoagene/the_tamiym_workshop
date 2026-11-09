import { isIPv6 } from 'node:net';

/**
 * `ConfigModule.forRoot({ validate })` implementation for the API.
 *
 * Extracted from `app.module.ts` (TTW-020 review follow-up) so the
 * production Origin-allowlist validation can be unit-tested directly
 * instead of only indirectly through full Nest module bootstrap.
 */

export const requiredEnvVars = [
  'DATABASE_URL',
  'JWT_ACCESS_SECRET',
  'JWT_REFRESH_SECRET',
  'MFA_TOTP_ENCRYPTION_KEY',
] as const;

/**
 * Mail transport settings required in production (TTW-085). Without them
 * `buildMailTransportConfig` falls back to `localhost:1025` and a hard-coded
 * sender, so the API would boot while every email silently failed.
 */
export const requiredProductionMailEnvVars = [
  'MAIL_HOST',
  'MAIL_USER',
  'MAIL_PASSWORD',
  'MAIL_FROM',
] as const;

/** Required in production only — surface Origin allowlists (TTW-020). */
export const requiredProductionEnvVars = [
  'AUTH_ADMIN_ORIGINS',
  'AUTH_CUSTOMER_ORIGINS',
  'CLAMAV_HOST',
  'DESIGN_SHARE_PUBLIC_ORIGIN',
  'NOTIFICATION_UNSUBSCRIBE_SECRET',
  ...requiredProductionMailEnvVars,
] as const;

/** Prefix used by `infra/runtime/secrets/.env.example` for unset secrets. */
const SECRETS_TEMPLATE_PLACEHOLDER_PREFIX = 'placeholder';

/**
 * True when `host` names the local machine: `localhost` or `*.localhost`,
 * the IPv4 loopback range `127.0.0.0/8`, the unspecified address `0.0.0.0`,
 * or IPv6 `::1` / `::` (including IPv4-mapped loopback). The host is first
 * canonicalised with the WHATWG URL parser, so spellings such as `127.1`,
 * `0`, `localhost.`, `[::1]` and `0:0:0:0:0:0:0:1` are caught too.
 */
export function isLocalMailHost(host: string): boolean {
  const trimmed = host.trim().replace(/\.$/, '');
  const unbracketed = trimmed.replace(/^\[(.*)\]$/, '$1');
  const literal = isIPv6(unbracketed) ? `[${unbracketed}]` : trimmed;
  let canonical: string;
  try {
    canonical = new URL(`http://${literal}`).hostname;
  } catch {
    canonical = trimmed.toLowerCase();
  }
  return (
    canonical === 'localhost' ||
    canonical.endsWith('.localhost') ||
    canonical.startsWith('127.') ||
    canonical === '0.0.0.0' ||
    canonical === '[::1]' ||
    canonical === '[::]' ||
    canonical.startsWith('[::ffff:7f') ||
    canonical === '[::ffff:0:0]'
  );
}

export const forbiddenPlaceholders = new Set([
  'secret',
  'your-access-secret-key-change-in-production',
  'your-refresh-secret-key-change-in-production',
]);

/**
 * The MFA key committed in `.env.test.example`, CI workflows and specs
 * (TTW-180). Compared on decoded bytes so whitespace or padding variants of
 * the same key are caught too.
 */
const COMMITTED_TEST_MFA_KEY = Buffer.from(
  'zghUm6jv4icb3WT8MzKea1lMrsgir7rONaShtv10zdQ=',
  'base64',
);

/** True for the committed test key or any key made of one repeated byte. */
function isPublicMfaKey(decoded: Buffer): boolean {
  return (
    decoded.equals(COMMITTED_TEST_MFA_KEY) ||
    decoded.every((byte) => byte === decoded[0])
  );
}

/**
 * Parse a comma-separated list of Origin URLs into their normalized
 * `origin` form (scheme + host + port), dropping blank and unparsable
 * entries.
 */
export function parseOriginEntries(raw: string): string[] {
  return raw
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry) => {
      try {
        return new URL(entry).origin;
      } catch {
        return null;
      }
    })
    .filter((entry): entry is string => Boolean(entry));
}

/**
 * `ConfigModule.forRoot({ validate })` callback.
 *
 * Skipped entirely under `NODE_ENV=test` (unit/e2e suites supply their own
 * env). Under `NODE_ENV=production`, additionally requires
 * `AUTH_ADMIN_ORIGINS` / `AUTH_CUSTOMER_ORIGINS` to each contain at least one
 * valid origin URL, since a missing or unparsable allowlist would otherwise
 * silently fall back to the localhost defaults in `auth-surface.ts`.
 * Production also requires usable mail settings (TTW-085): `MAIL_HOST`,
 * `MAIL_USER`, `MAIL_PASSWORD` and `MAIL_FROM` set, none left as a secrets
 * template `PLACEHOLDER_*` value, and `MAIL_HOST` not the local machine.
 */
export function validateEnv(
  config: Record<string, unknown>,
): Record<string, unknown> {
  if (process.env.NODE_ENV === 'test') {
    return config;
  }
  for (const key of requiredEnvVars) {
    const value = config[key];
    if (
      value === undefined ||
      value === null ||
      (typeof value !== 'string' &&
        typeof value !== 'number' &&
        typeof value !== 'boolean') ||
      String(value).trim() === ''
    ) {
      throw new Error(`Missing required environment variable: ${key}`);
    }
    const normalized = `${value}`.trim().toLowerCase();
    if (forbiddenPlaceholders.has(normalized)) {
      throw new Error(
        `Environment variable ${key} must be set to a secure value, not a placeholder`,
      );
    }
  }

  const mfaKeyRaw = config.MFA_TOTP_ENCRYPTION_KEY;
  if (typeof mfaKeyRaw === 'string' && mfaKeyRaw.trim() !== '') {
    let decoded: Buffer;
    try {
      decoded = Buffer.from(mfaKeyRaw.trim(), 'base64');
    } catch {
      throw new Error(
        'Environment variable MFA_TOTP_ENCRYPTION_KEY must be valid base64',
      );
    }
    if (decoded.length !== 32) {
      throw new Error(
        'Environment variable MFA_TOTP_ENCRYPTION_KEY must decode to exactly 32 bytes',
      );
    }
    if (process.env.NODE_ENV === 'production' && isPublicMfaKey(decoded)) {
      // Never print the value: it is either a committed key or a filler.
      throw new Error(
        'Environment variable MFA_TOTP_ENCRYPTION_KEY is a publicly known or filler key and is refused in production; generate a fresh one with `openssl rand -base64 32`',
      );
    }
  }

  if (process.env.NODE_ENV === 'production') {
    for (const key of requiredProductionEnvVars) {
      const value = config[key];
      if (typeof value !== 'string' || value.trim() === '') {
        throw new Error(
          `Missing required production environment variable: ${key}`,
        );
      }
      if (key === 'AUTH_ADMIN_ORIGINS' || key === 'AUTH_CUSTOMER_ORIGINS') {
        if (parseOriginEntries(value).length === 0) {
          throw new Error(
            `Environment variable ${key} must contain at least one valid origin URL`,
          );
        }
      }
      if (key === 'DESIGN_SHARE_PUBLIC_ORIGIN') {
        try {
          const originUrl = new URL(value.trim());
          if (
            originUrl.protocol !== 'http:' &&
            originUrl.protocol !== 'https:'
          ) {
            throw new Error('unsupported protocol');
          }
        } catch {
          throw new Error(
            'Environment variable DESIGN_SHARE_PUBLIC_ORIGIN must be a valid http(s) absolute URL',
          );
        }
      }
    }

    for (const key of requiredProductionMailEnvVars) {
      // Presence is checked by the loop above; never echo the value, since
      // MAIL_PASSWORD must not reach a log.
      const value = String(config[key]).trim();
      if (value.toLowerCase().startsWith(SECRETS_TEMPLATE_PLACEHOLDER_PREFIX)) {
        throw new Error(
          `Environment variable ${key} must be set to a real value, not a placeholder`,
        );
      }
    }
    if (isLocalMailHost(String(config.MAIL_HOST))) {
      throw new Error(
        'Environment variable MAIL_HOST must name a real mail server in production, not the local machine',
      );
    }

    const virusScanner = String(
      typeof config.VIRUS_SCANNER === 'string' ? config.VIRUS_SCANNER : '',
    )
      .trim()
      .toLowerCase();
    if (virusScanner === 'deterministic' || virusScanner === 'unavailable') {
      throw new Error(
        `VIRUS_SCANNER=${virusScanner} is forbidden in production; use clamav`,
      );
    }

    const bankResolution = String(
      typeof config.PAYOUT_BANK_RESOLUTION_MODE === 'string'
        ? config.PAYOUT_BANK_RESOLUTION_MODE
        : '',
    )
      .trim()
      .toLowerCase();
    if (bankResolution && bankResolution !== 'live') {
      throw new Error(
        'PAYOUT_BANK_RESOLUTION_MODE must be live (or unset) in production; stub and other values are forbidden',
      );
    }
  }
  return config;
}
