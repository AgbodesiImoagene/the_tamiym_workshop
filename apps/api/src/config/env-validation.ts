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

/** Required in production only — surface Origin allowlists (TTW-020). */
export const requiredProductionEnvVars = [
  'AUTH_ADMIN_ORIGINS',
  'AUTH_CUSTOMER_ORIGINS',
  'CLAMAV_HOST',
] as const;

export const forbiddenPlaceholders = new Set([
  'secret',
  'your-access-secret-key-change-in-production',
  'your-refresh-secret-key-change-in-production',
]);

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
  }
  return config;
}
