/** Seeded e2e identities from apps/api/scripts/seed-e2e-dummy-data.ts */
export const E2E_PASSWORD = 'TestPassword1!';

/**
 * Deterministic admin TOTP secret written by seed:e2e (must stay in sync with
 * `E2E_ADMIN_TOTP_SECRET` in apps/api/scripts/seed-e2e-dummy-data.ts).
 */
export const E2E_ADMIN_TOTP_SECRET = 'JBSWY3DPEHPK3PXP';

export const e2eUsers = {
  admin: {
    email: 'admin.e2e@tamiym.test',
    password: E2E_PASSWORD,
    role: 'ADMIN' as const,
    totpSecret: E2E_ADMIN_TOTP_SECRET,
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
