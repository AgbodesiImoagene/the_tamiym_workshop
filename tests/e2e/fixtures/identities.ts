/** Seeded e2e identities from apps/api/scripts/seed-e2e-dummy-data.ts */
export const E2E_PASSWORD = 'TestPassword1!';

export const e2eUsers = {
  admin: {
    email: 'admin.e2e@tamiym.test',
    password: E2E_PASSWORD,
    role: 'ADMIN' as const,
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
