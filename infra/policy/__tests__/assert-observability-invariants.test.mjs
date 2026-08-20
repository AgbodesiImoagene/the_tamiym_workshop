import assert from 'node:assert/strict';
import test from 'node:test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { assertObservabilityInvariants } from '../assert-observability-invariants.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');

test('assertObservabilityInvariants passes on this repo', () => {
  const failures = assertObservabilityInvariants(repoRoot);
  assert.deepEqual(failures, []);
});

test('assertObservabilityInvariants fails when catalog is missing', () => {
  const failures = assertObservabilityInvariants(path.join(repoRoot, 'infra/policy'));
  assert.ok(failures.some((f) => /missing required file:.*catalog\.json/.test(f)));
});
