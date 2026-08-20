import assert from 'node:assert/strict';
import test from 'node:test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { assertReleaseInvariants } from '../assert-release-invariants.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');

test('assertReleaseInvariants passes on this repo', () => {
  const failures = assertReleaseInvariants(repoRoot);
  assert.deepEqual(failures, []);
});

test('assertReleaseInvariants fails when required release artefacts are missing', () => {
  const failures = assertReleaseInvariants(path.join(repoRoot, 'infra/policy'));
  assert.ok(failures.some((f) => /missing required file:.*release-manifest\.schema\.json/.test(f)));
});
