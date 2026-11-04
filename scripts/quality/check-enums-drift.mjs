#!/usr/bin/env node
/**
 * Regenerate the shared Prisma enums in an isolated temp directory and fail
 * when the committed packages/types/src/enums.generated.ts has drifted.
 *
 * Usage:
 *   node scripts/quality/check-enums-drift.mjs
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = process.cwd();
const defaultSchema = resolve(repoRoot, 'apps/api/prisma/schema.prisma');
const defaultCommitted = resolve(repoRoot, 'packages/types/src/enums.generated.ts');

/**
 * @returns {boolean} true when the committed file differs from a fresh generation
 */
export function checkEnumsDrift({
  schemaPath = defaultSchema,
  committedPath = defaultCommitted,
} = {}) {
  for (const [filePath, label] of [
    [schemaPath, 'Prisma schema'],
    [committedPath, 'committed shared enums'],
  ]) {
    if (!existsSync(filePath)) {
      throw new Error(`Missing ${label}: ${filePath}`);
    }
  }

  const tempDir = mkdtempSync(join(tmpdir(), 'ttw-enums-drift-'));
  const tempOutput = join(tempDir, 'enums.generated.ts');

  try {
    execFileSync(
      'pnpm',
      [
        '--filter',
        '@tamiym/types',
        'generate:enums',
        '--',
        '--schema',
        resolve(schemaPath),
        '--output',
        tempOutput,
      ],
      { cwd: repoRoot, stdio: ['ignore', 'ignore', 'inherit'] }
    );

    return readFileSync(tempOutput, 'utf8') !== readFileSync(committedPath, 'utf8');
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  console.log('Regenerating shared enums into temp directory...');
  if (checkEnumsDrift()) {
    console.error('Shared enum drift detected:');
    console.error('  stale packages/types/src/enums.generated.ts');
    console.error('Run `pnpm --filter @tamiym/types generate:enums` and commit the updated file.');
    process.exit(1);
  }
  console.log('Shared enum drift check passed.');
}
