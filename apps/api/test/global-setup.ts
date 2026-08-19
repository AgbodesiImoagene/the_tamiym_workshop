import { execFile } from 'node:child_process';
import { resolve } from 'node:path';
import { promisify } from 'node:util';
import { config as loadEnv } from 'dotenv';

const execFileAsync = promisify(execFile);

function databaseNameFromUrl(databaseUrl: string): string {
  try {
    const { pathname } = new URL(databaseUrl);
    return decodeURIComponent(
      (pathname || '').replace(/^\//, '').split('/')[0] || '',
    );
  } catch {
    return '';
  }
}

function assertTestDatabaseUrl(databaseUrl: string): void {
  if (process.env.ALLOW_NON_TEST_DATABASE_MIGRATE === 'true') {
    return;
  }
  const dbName = databaseNameFromUrl(databaseUrl);
  if (/test|e2e/i.test(dbName)) {
    return;
  }
  throw new Error(
    `Refusing to migrate a non-test database for e2e globalSetup (name="${dbName || '(empty)'}"). Use a *test* / *e2e* database name or set ALLOW_NON_TEST_DATABASE_MIGRATE=true.`,
  );
}

export default async function globalSetup(): Promise<void> {
  process.env.NODE_ENV = process.env.NODE_ENV || 'test';
  loadEnv({
    path: resolve(__dirname, '../.env.test'),
    override: false,
    quiet: true,
  });

  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error('DATABASE_URL is required for API e2e globalSetup');
  }
  assertTestDatabaseUrl(databaseUrl);

  const apiRoot = resolve(__dirname, '..');
  await execFileAsync('pnpm', ['exec', 'prisma', 'migrate', 'deploy'], {
    cwd: apiRoot,
    env: process.env,
  });
}
