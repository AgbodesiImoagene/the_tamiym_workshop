import assert from 'node:assert/strict';
import test from 'node:test';
import { runReleasePreflight } from '../preflight-release.mjs';
import { checkMigrationArtefacts, countMigrations } from '../check-migration-artefacts.mjs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..');

test('runReleasePreflight passes on repository root', () => {
  const errors = runReleasePreflight(repoRoot);
  assert.deepEqual(errors, []);
});

test('checkMigrationArtefacts finds migrations', () => {
  const errors = checkMigrationArtefacts(repoRoot);
  assert.deepEqual(errors, []);
  assert.ok(countMigrations(repoRoot) > 0);
});
