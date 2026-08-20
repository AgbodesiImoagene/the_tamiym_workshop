import assert from 'node:assert/strict';
import test from 'node:test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { assertBackupInvariants } from '../assert-backup-invariants.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');

test('assertBackupInvariants passes on this repo', () => {
  const failures = assertBackupInvariants(repoRoot);
  assert.deepEqual(failures, []);
});

test('assertBackupInvariants fails when policy is missing', () => {
  const failures = assertBackupInvariants(path.join(repoRoot, 'infra/policy'));
  assert.ok(failures.some((f) => /missing required file:.*policy\.json/.test(f)));
});
