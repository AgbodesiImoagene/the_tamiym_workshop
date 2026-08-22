#!/usr/bin/env node
/**
 * TTW-054 — Live migration baseline verification against a PostgreSQL database.
 *
 * Runs `prisma migrate deploy`, checks `migrate status`, then proves no drift
 * between applied migrations and the live database via `migrate diff --exit-code`.
 *
 * Requires DATABASE_URL. Safe for blank databases and restored snapshots.
 */
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const defaultRoot = path.resolve(__dirname, '../../..');
const API_REL = 'apps/api';

/**
 * @param {string} root
 * @returns {string}
 */
export function apiDir(root) {
  return path.join(root, API_REL);
}

/**
 * @param {string} root
 * @param {string[]} prismaArgs
 * @param {Record<string, string | undefined>} env
 */
export function runPrisma(root, prismaArgs, env = {}) {
  return execFileSync('pnpm', ['exec', 'prisma', ...prismaArgs], {
    cwd: apiDir(root),
    encoding: 'utf8',
    env: { ...process.env, ...env },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}

/**
 * @param {string} databaseUrl
 * @param {string | undefined} shadowDatabaseUrl
 * @returns {string | undefined}
 */
export function resolveShadowDatabaseUrl(databaseUrl, shadowDatabaseUrl) {
  if (shadowDatabaseUrl?.trim()) {
    return shadowDatabaseUrl.trim();
  }
  try {
    const url = new URL(databaseUrl);
    const dbName = url.pathname.replace(/^\//, '').split('/')[0] || 'postgres';
    url.pathname = `/${dbName}_shadow`;
    return url.toString();
  } catch {
    return undefined;
  }
}

/**
 * @param {string} root
 * @param {string} databaseUrl
 * @returns {string[]}
 */
export function verifyMigrationBaseline(root, databaseUrl) {
  const errors = [];
  if (!databaseUrl || !databaseUrl.trim()) {
    return ['DATABASE_URL is required'];
  }

  const env = { DATABASE_URL: databaseUrl };
  const shadowUrl = resolveShadowDatabaseUrl(databaseUrl, process.env.SHADOW_DATABASE_URL);

  try {
    runPrisma(root, ['migrate', 'deploy'], env);
  } catch (error) {
    const stderr =
      /** @type {NodeJS.ErrnoException & { stderr?: Buffer }} */ (error).stderr?.toString() ?? '';
    errors.push(`prisma migrate deploy failed: ${stderr || error.message}`);
    return errors;
  }

  try {
    const status = runPrisma(root, ['migrate', 'status'], env);
    if (!/Database schema is up to date|No pending migrations to apply/i.test(status)) {
      errors.push(`prisma migrate status unexpected output:\n${status.trim()}`);
    }
  } catch (error) {
    const stderr =
      /** @type {NodeJS.ErrnoException & { stderr?: Buffer }} */ (error).stderr?.toString() ?? '';
    errors.push(`prisma migrate status failed: ${stderr || error.message}`);
  }

  try {
    const diffArgs = [
      'migrate',
      'diff',
      '--from-migrations',
      'prisma/migrations',
      '--to-config-datasource',
      '--exit-code',
    ];
    if (shadowUrl) {
      diffArgs.push('--shadow-database-url', shadowUrl);
    }
    runPrisma(root, diffArgs, env);
  } catch (error) {
    const code = /** @type {NodeJS.ErrnoException & { status?: number }} */ (error).status;
    if (code === 2) {
      errors.push('schema drift detected after migrate deploy (migrate diff exit 2)');
    } else {
      const stderr =
        /** @type {NodeJS.ErrnoException & { stderr?: Buffer }} */ (error).stderr?.toString() ?? '';
      errors.push(`prisma migrate diff failed: ${stderr || error.message}`);
    }
  }

  return errors;
}

function main() {
  const root = process.cwd();
  const databaseUrl = process.env.DATABASE_URL;
  const errors = verifyMigrationBaseline(root, databaseUrl ?? '');
  if (errors.length > 0) {
    console.error('Migration baseline verification failed:');
    for (const err of errors) {
      console.error(`  - ${err}`);
    }
    process.exit(1);
  }
  console.log('Migration baseline verification passed (deploy + status + no drift).');
}

if (import.meta.url === new URL(process.argv[1], 'file:').href) {
  main();
}
