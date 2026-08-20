/** Seeded e2e identities from apps/api/scripts/seed-e2e-dummy-data.ts */
export const E2E_PASSWORD = 'TestPassword1!';

/**
 * Deterministic admin TOTP secret written by seed:e2e (must stay in sync with
 * `E2E_ADMIN_TOTP_SECRET` in apps/api/scripts/seed-e2e-dummy-data.ts).
 */
export const E2E_ADMIN_TOTP_SECRET = 'JBSWY3DPEHPK3PXP';

/**
 * Deterministic recovery codes for primary admin only (hashed at rest in seed).
 * Indexed by Playwright retry so CI retries remain idempotent.
 */
export const E2E_ADMIN_RECOVERY_CODES = [
  'A1B2-C3D4-E5F6-7890-ABCD-EF01-2345-6789',
  'B2C3-D4E5-F678-90AB-CDEF-0123-4567-89AB',
  'C3D4-E5F6-7890-ABCD-EF01-2345-6789-ABCD',
] as const;

/** Stable seed id for the unenrolled admin (MFA reset target). */
export const E2E_ADMIN_ENROLL_USER_ID = 'e2e-user-admin-enroll';

export const e2eUsers = {
  admin: {
    email: 'admin.e2e@tamiym.test',
    password: E2E_PASSWORD,
    role: 'ADMIN' as const,
    totpSecret: E2E_ADMIN_TOTP_SECRET,
    recoveryCodes: E2E_ADMIN_RECOVERY_CODES,
  },
  /** Seeded without MFA — for enrollment UI smoke only. */
  adminEnroll: {
    id: E2E_ADMIN_ENROLL_USER_ID,
    email: 'admin.enroll.e2e@tamiym.test',
    password: E2E_PASSWORD,
    role: 'ADMIN' as const,
  },
  /** Same TOTP as primary; used to avoid admin_login throttle collisions. */
  adminApprover: {
    email: 'approver.e2e@tamiym.test',
    password: E2E_PASSWORD,
    role: 'ADMIN' as const,
    totpSecret: E2E_ADMIN_TOTP_SECRET,
    recoveryCodes: E2E_ADMIN_RECOVERY_CODES,
  },
  organiser: {
    email: 'organizer.e2e@tamiym.test',
    password: E2E_PASSWORD,
    role: 'ORGANIZER' as const,
  },
  customer: {
    email: 'customer.e2e@tamiym.test',
    password: E2E_PASSWORD,
    role: 'CUSTOMER' as const,
  },
} as const;

export const urls = {
  api: process.env.PLAYWRIGHT_API_URL ?? 'http://localhost:3001',
  web: process.env.PLAYWRIGHT_WEB_URL ?? 'http://localhost:3000',
  app: process.env.PLAYWRIGHT_APP_URL ?? 'http://localhost:3002',
  admin: process.env.PLAYWRIGHT_ADMIN_URL ?? 'http://localhost:3003',
};
