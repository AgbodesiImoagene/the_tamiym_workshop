import assert from 'node:assert/strict';
import test from 'node:test';
import { evaluateStopGo, runStopGoRehearsal } from '../rehearse-stop-go-gates.mjs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..');

test('evaluateStopGo blocks failed and pending critical gates', () => {
  assert.deepEqual(evaluateStopGo({ infraValidate: 'pass', migrationBaseline: 'fail' }), [
    'migrationBaseline=fail',
  ]);
  assert.deepEqual(evaluateStopGo({ infraValidate: 'pending', migrationBaseline: 'pass' }), [
    'infraValidate=pending',
  ]);
  assert.deepEqual(evaluateStopGo({ infraValidate: 'pass', migrationBaseline: 'pass' }), []);
});

test('evaluateStopGo blocks failed backup gate', () => {
  assert.deepEqual(
    evaluateStopGo({
      infraValidate: 'pass',
      migrationBaseline: 'pass',
      backupRecovery: 'fail',
    }),
    ['backupRecovery=fail']
  );
});

test('runStopGoRehearsal passes all scenarios on repository root', () => {
  const { passed, failed } = runStopGoRehearsal(repoRoot);
  assert.equal(failed, 0);
  assert.ok(passed >= 4);
});
