#!/usr/bin/env node
/**
 * TTW-005 — Fail when apps/api/prisma/schema.prisma no longer describes the
 * database built by apps/api/prisma/migrations.
 *
 * `prisma migrate dev` proposes every difference as a new migration, so drift
 * here means the next migration may drop something by accident. This is not the
 * same check as release:verify-migrations, which compares the migrations to a
 * live database and never reads schema.prisma.
 *
 * Needs a reachable PostgreSQL. Prisma resets the shadow database, so it must be
 * a dedicated one: DATABASE_URL and SHADOW_DATABASE_URL come from the environment
 * or apps/api/.env, and the shadow URL defaults to `<database>_shadow`.
 *
 * Usage:
 *   node scripts/quality/check-prisma-migration-drift.mjs
 */
import { existsSync, realpathSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  resolveShadowDatabaseUrl,
  runPrisma,
} from '../../infra/release/scripts/verify-migration-baseline.mjs';

const defaultRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

const DIFF_ARGS = [
  'migrate',
  'diff',
  '--from-migrations',
  'prisma/migrations',
  '--to-schema',
  'prisma/schema.prisma',
  '--script',
  '--exit-code',
];

/** `prisma migrate diff --exit-code` status when the two sides differ. */
const EXIT_DIFF_NOT_EMPTY = 2;

/** Postgres silently cuts longer names, which can land on another database. */
const MAX_DATABASE_NAME_BYTES = 63;

/**
 * @param {string | undefined} name
 * @returns {string}
 */
function truncatedName(name = '') {
  return Buffer.from(name).subarray(0, MAX_DATABASE_NAME_BYTES).toString();
}

/**
 * @param {string} text
 * @returns {string}
 */
export function redactConnectionStrings(text) {
  return text.replace(/postgres(ql)?:\/\/\S+/gi, '<database-url>');
}

/**
 * @param {string | undefined} value
 * @returns {URL | null}
 */
function parseUrl(value) {
  try {
    return new URL(value ?? '');
  } catch {
    return null;
  }
}

/**
 * Empty segments are kept on purpose: with `//name`, Prisma connects with an empty
 * database name and Postgres falls back to the database named after the user.
 *
 * @param {URL} url
 * @returns {string[]} decoded path segments; Prisma treats the first as the database
 */
function databaseSegments(url) {
  try {
    return url.pathname.replace(/^\//, '').replace(/\/$/, '').split('/').map(decodeURIComponent);
  } catch {
    return [];
  }
}

/**
 * Prisma wipes the shadow database, so refuse anything that could hold real data.
 * Names are compared without the host, because `localhost` and `127.0.0.1` can be
 * the same server.
 *
 * @param {string} databaseUrl
 * @param {string | undefined} shadowUrl
 * @returns {string[]}
 */
export function shadowTargetErrors(databaseUrl, shadowUrl) {
  const shadow = parseUrl(shadowUrl);
  if (!shadow) {
    return ['SHADOW_DATABASE_URL is not a valid URL'];
  }

  const segments = databaseSegments(shadow);
  if (segments.length !== 1 || !segments[0]) {
    return ['SHADOW_DATABASE_URL must contain a single database name'];
  }

  const [name] = segments;
  if (Buffer.byteLength(name) > MAX_DATABASE_NAME_BYTES) {
    return [`SHADOW_DATABASE_URL names a database longer than ${MAX_DATABASE_NAME_BYTES} bytes`];
  }

  const errors = [];
  const main = parseUrl(databaseUrl);
  if (main && truncatedName(databaseSegments(main)[0]) === name) {
    errors.push('SHADOW_DATABASE_URL points at the same database as DATABASE_URL');
  }
  if (!/shadow/i.test(name)) {
    errors.push('SHADOW_DATABASE_URL must name a dedicated database containing "shadow"');
  }
  return errors;
}

/**
 * @param {{
 *   root?: string,
 *   env?: Record<string, string | undefined>,
 *   run?: typeof runPrisma,
 * }} [options]
 * @returns {{ ok: boolean, errors: string[] }}
 */
export function checkPrismaMigrationDrift({
  root = defaultRoot,
  env = process.env,
  run = runPrisma,
} = {}) {
  const databaseUrl = env.DATABASE_URL?.trim();
  if (!databaseUrl) {
    return { ok: false, errors: ['DATABASE_URL is required'] };
  }

  const shadowUrl = resolveShadowDatabaseUrl(databaseUrl, env.SHADOW_DATABASE_URL);
  const targetErrors = shadowTargetErrors(databaseUrl, shadowUrl);
  if (targetErrors.length > 0) {
    return { ok: false, errors: targetErrors };
  }

  try {
    run(root, DIFF_ARGS, { DATABASE_URL: databaseUrl, SHADOW_DATABASE_URL: shadowUrl });
    return { ok: true, errors: [] };
  } catch (error) {
    const failure =
      /** @type {NodeJS.ErrnoException & { status?: number, stdout?: string, stderr?: string }} */ (
        error
      );
    if (failure.status === EXIT_DIFF_NOT_EMPTY) {
      return {
        ok: false,
        errors: [
          'schema.prisma and the migrations disagree. Prisma would run:',
          redactConnectionStrings(String(failure.stdout ?? '').trim()),
        ],
      };
    }
    return {
      ok: false,
      errors: [
        'could not compare schema.prisma with the migrations. Is PostgreSQL running, and does the shadow database exist?',
        redactConnectionStrings(String(failure.stderr || failure.message).trim()),
      ],
    };
  }
}

if (process.argv[1] && realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const envFile = path.join(defaultRoot, 'apps/api/.env');
  if (existsSync(envFile)) {
    process.loadEnvFile(envFile);
  }

  const { ok, errors } = checkPrismaMigrationDrift();
  if (!ok) {
    for (const line of errors) {
      console.error(line);
    }
    console.error(
      'Fix schema.prisma, or generate a migration with `pnpm --filter api exec prisma migrate dev`. See docs/database-only-objects.md.'
    );
    process.exit(1);
  }
  console.log('Prisma schema matches the migrations.');
}
