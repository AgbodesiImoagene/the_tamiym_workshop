import { defineConfig, devices } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = path.dirname(fileURLToPath(import.meta.url));
const authDir = path.join(rootDir, 'tests/e2e/.auth');
const apiEnvTestPath = path.join(rootDir, 'apps/api/.env.test');

/** Load KEY=VALUE pairs without overriding existing process.env (no root dotenv dep). */
function loadEnvFile(filePath: string): void {
  if (!fs.existsSync(filePath)) return;
  for (const rawLine of fs.readFileSync(filePath, 'utf8').split('\n')) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq <= 0) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
}

// Local runs: prefer apps/api/.env.test without overriding CI-injected env.
if (!process.env.CI) {
  loadEnvFile(apiEnvTestPath);
}

// Match Nest CORS defaults (localhost, not 127.0.0.1).
const WEB_URL = process.env.PLAYWRIGHT_WEB_URL ?? 'http://localhost:3000';
const APP_URL = process.env.PLAYWRIGHT_APP_URL ?? 'http://localhost:3002';
const ADMIN_URL = process.env.PLAYWRIGHT_ADMIN_URL ?? 'http://localhost:3003';
const API_URL = process.env.PLAYWRIGHT_API_URL ?? 'http://localhost:3001';

const reuseExistingServer = !process.env.CI;

/**
 * Shared env for Nest + Next processes started by Playwright webServer.
 * Prefer CI-injected secrets; fall back to apps/api/.env.test for local runs.
 */
const serverEnv = {
  ...process.env,
  NODE_ENV: process.env.NODE_ENV ?? 'test',
  PORT: process.env.PORT ?? '3001',
  NEXT_PUBLIC_API_URL: `${API_URL}/v1`,
  NEXT_PUBLIC_CUSTOMER_APP_URL: APP_URL,
  NEXT_PUBLIC_ADMIN_APP_URL: ADMIN_URL,
  CORS_ORIGIN: `${WEB_URL},${APP_URL},${ADMIN_URL}`,
};

export default defineConfig({
  testDir: path.join(rootDir, 'tests/e2e'),
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 2 : undefined,
  reporter: [['list'], ['html', { open: 'never', outputFolder: 'playwright-report' }]],
  timeout: 60_000,
  expect: { timeout: 15_000 },
  use: {
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    actionTimeout: 15_000,
  },
  projects: [
    {
      name: 'setup',
      testMatch: /setup\/.*\.setup\.ts/,
    },
    {
      name: 'chromium-web',
      dependencies: ['setup'],
      testMatch: /web\/.*\.spec\.ts/,
      use: {
        ...devices['Desktop Chrome'],
        baseURL: WEB_URL,
      },
    },
    {
      name: 'chromium-app',
      dependencies: ['setup'],
      testMatch: /app\/.*\.spec\.ts/,
      use: {
        ...devices['Desktop Chrome'],
        baseURL: APP_URL,
        storageState: path.join(authDir, 'customer.json'),
      },
    },
    {
      name: 'chromium-admin',
      dependencies: ['setup'],
      testMatch: /admin\/.*\.spec\.ts/,
      use: {
        ...devices['Desktop Chrome'],
        baseURL: ADMIN_URL,
        storageState: path.join(authDir, 'admin.json'),
      },
    },
    {
      name: 'chromium-journeys',
      dependencies: ['setup'],
      testMatch: /journeys\/.*\.spec\.ts/,
      use: {
        ...devices['Desktop Chrome'],
        baseURL: APP_URL,
      },
    },
    // Full-matrix stubs (invoked via test:e2e:matrix; not on every PR).
    {
      name: 'firefox-web',
      dependencies: ['setup'],
      testMatch: /web\/.*\.spec\.ts/,
      use: { ...devices['Desktop Firefox'], baseURL: WEB_URL },
    },
    {
      name: 'webkit-web',
      dependencies: ['setup'],
      testMatch: /web\/.*\.spec\.ts/,
      use: { ...devices['Desktop Safari'], baseURL: WEB_URL },
    },
    {
      name: 'mobile-chromium-web',
      dependencies: ['setup'],
      testMatch: /web\/.*\.spec\.ts/,
      use: { ...devices['Pixel 5'], baseURL: WEB_URL },
    },
    {
      name: 'chromium-a11y',
      dependencies: ['setup'],
      testMatch: /accessibility\/.*\.spec\.ts/,
      use: { ...devices['Desktop Chrome'], baseURL: WEB_URL },
    },
    {
      name: 'chromium-visual',
      dependencies: ['setup'],
      testMatch: /visual\/web-home\.visual\.spec\.ts/,
      use: { ...devices['Desktop Chrome'], baseURL: WEB_URL },
    },
    {
      name: 'mobile-visual-web',
      dependencies: ['setup'],
      testMatch: /visual\/web-home-mobile\.visual\.spec\.ts/,
      use: { ...devices['Pixel 5'], baseURL: WEB_URL },
    },
  ],
  webServer: [
    {
      command: 'pnpm --filter api start:prod',
      url: `${API_URL}/v1/health`,
      reuseExistingServer,
      timeout: 180_000,
      env: serverEnv,
    },
    {
      command: 'pnpm --filter web exec next start -H localhost -p 3000',
      url: WEB_URL,
      reuseExistingServer,
      timeout: 180_000,
      env: { ...serverEnv, PORT: '3000' },
    },
    {
      command: 'pnpm --filter app exec next start -H localhost -p 3002',
      url: APP_URL,
      reuseExistingServer,
      timeout: 180_000,
      env: { ...serverEnv, PORT: '3002' },
    },
    {
      command: 'pnpm --filter admin exec next start -H localhost -p 3003',
      url: ADMIN_URL,
      reuseExistingServer,
      timeout: 180_000,
      env: { ...serverEnv, PORT: '3003' },
    },
  ],
});
