#!/usr/bin/env node
/**
 * Regenerate OpenAPI artefacts in an isolated temp directory and fail when
 * committed outputs drift.
 *
 * Usage:
 *   node scripts/quality/check-openapi-drift.mjs
 */
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { copyFileSync, existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const repoRoot = process.cwd();
const committedOpenApi = resolve(repoRoot, 'docs/openapi/openapi.json');
const committedTypes = resolve(repoRoot, 'packages/types/src/openapi.generated.ts');

function sha256(filePath) {
  const content = readFileSync(filePath);
  return createHash('sha256').update(content).digest('hex');
}

function run(command, args, env = {}) {
  execFileSync(command, args, {
    cwd: repoRoot,
    stdio: 'inherit',
    env: { ...process.env, ...env },
  });
}

function assertExists(filePath, label) {
  if (!existsSync(filePath)) {
    console.error(`Missing ${label}: ${filePath}`);
    process.exit(1);
  }
}

assertExists(committedOpenApi, 'committed OpenAPI JSON');
assertExists(committedTypes, 'committed OpenAPI TypeScript types');

const tempDir = mkdtempSync(join(tmpdir(), 'ttw-openapi-drift-'));
const tempOpenApi = join(tempDir, 'openapi.json');
const tempTypes = join(tempDir, 'openapi.generated.ts');

try {
  console.log('Regenerating OpenAPI JSON into temp directory...');
  run('pnpm', ['--filter', 'api', 'generate:openapi', '--', '--output', tempOpenApi]);

  console.log('Regenerating OpenAPI TypeScript types into temp directory...');
  run('pnpm', [
    '--filter',
    '@tamiym/types',
    'generate:openapi',
    '--',
    '--input',
    tempOpenApi,
    '--output',
    tempTypes,
  ]);

  const drift = [];

  if (sha256(tempOpenApi) !== sha256(committedOpenApi)) {
    drift.push('docs/openapi/openapi.json');
  }

  if (sha256(tempTypes) !== sha256(committedTypes)) {
    drift.push('packages/types/src/openapi.generated.ts');
  }

  if (drift.length > 0) {
    console.error('OpenAPI contract drift detected:');
    for (const file of drift) {
      console.error(`  stale ${file}`);
    }
    console.error('Run `pnpm openapi:generate` and commit the updated artefacts.');
    process.exit(1);
  }

  console.log('OpenAPI contract drift check passed.');
} finally {
  rmSync(tempDir, { recursive: true, force: true });
}
