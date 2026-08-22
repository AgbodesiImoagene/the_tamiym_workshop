#!/usr/bin/env node
/**
 * TTW-054 — Credential-free backup/restore rehearsal helpers.
 *
 * When DATABASE_URL is set, runs post-restore invariant queries against the
 * migrated database. Always validates the TTW-067 isolated-restore checklist
 * preconditions when RESTORE_* env vars are provided.
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const defaultRoot = path.resolve(__dirname, '../../..');

/**
 * @param {string} root
 * @returns {string}
 */
export function postRestoreQueriesPath(root) {
  return path.join(root, 'infra/runtime/backup/invariants/post-restore-queries.sql');
}

/**
 * @param {string} root
 * @param {string} databaseUrl
 * @returns {string[]}
 */
export function runPostRestoreQueries(root, databaseUrl) {
  const errors = [];
  const sqlPath = postRestoreQueriesPath(root);
  if (!fs.existsSync(sqlPath)) {
    return [`missing post-restore queries at ${sqlPath}`];
  }

  try {
    execFileSync(
      'pnpm',
      ['exec', 'prisma', 'db', 'execute', '--file', sqlPath, '--schema', 'prisma/schema.prisma'],
      {
        cwd: path.join(root, 'apps/api'),
        encoding: 'utf8',
        env: { ...process.env, DATABASE_URL: databaseUrl },
        stdio: ['ignore', 'pipe', 'pipe'],
      }
    );
  } catch (error) {
    const stderr =
      /** @type {NodeJS.ErrnoException & { stderr?: Buffer }} */ (error).stderr?.toString() ?? '';
    errors.push(`post-restore queries failed: ${stderr || error.message}`);
  }

  return errors;
}

/**
 * @param {string} root
 * @param {{ evidenceDir: string; confirmTarget: string; target?: string }} options
 * @returns {string[]}
 */
export function runRestoreChecklist(root, options) {
  const errors = [];
  const script = path.join(root, 'infra/runtime/backup/scripts/restore-isolated-check.sh');
  if (!fs.existsSync(script)) {
    return [`missing restore checklist script at ${script}`];
  }

  try {
    execFileSync('bash', [script], {
      cwd: root,
      encoding: 'utf8',
      env: {
        ...process.env,
        RESTORE_TARGET: options.target ?? 'temporary-validation',
        RESTORE_EVIDENCE_DIR: options.evidenceDir,
        RESTORE_CONFIRM_TARGET: options.confirmTarget,
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  } catch (error) {
    const stderr =
      /** @type {NodeJS.ErrnoException & { stderr?: Buffer }} */ (error).stderr?.toString() ?? '';
    errors.push(`restore-isolated-check failed: ${stderr || error.message}`);
  }

  return errors;
}

/**
 * @param {string} root
 * @param {{ databaseUrl?: string; evidenceDir?: string; confirmTarget?: string }} options
 * @returns {string[]}
 */
export function rehearseBackupRestore(root, options = {}) {
  const errors = [];
  const databaseUrl = options.databaseUrl ?? process.env.DATABASE_URL;
  const evidenceDir =
    options.evidenceDir ??
    process.env.RESTORE_EVIDENCE_DIR ??
    path.join(root, 'infra/release/fixtures/backup-evidence');

  if (databaseUrl) {
    errors.push(...runPostRestoreQueries(root, databaseUrl));
  }

  if (options.confirmTarget || process.env.RESTORE_CONFIRM_TARGET) {
    errors.push(
      ...runRestoreChecklist(root, {
        evidenceDir,
        confirmTarget:
          options.confirmTarget ??
          process.env.RESTORE_CONFIRM_TARGET ??
          'ttw-054-rehearsal-isolated',
        target: process.env.RESTORE_TARGET,
      })
    );
  }

  return errors;
}

function main() {
  const root = process.cwd();
  const errors = rehearseBackupRestore(root, {});
  if (errors.length > 0) {
    console.error('Backup/restore rehearsal failed:');
    for (const err of errors) {
      console.error(`  - ${err}`);
    }
    process.exit(1);
  }
  console.log('Backup/restore rehearsal passed.');
}

if (import.meta.url === new URL(process.argv[1], 'file:').href) {
  main();
}
