import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildReleaseManifest } from '../build-release-manifest.mjs';
import {
  validateReleaseManifest,
  validateReleaseManifestFile,
  releasePaths,
} from '../validate-release-manifest-lib.mjs';
import { assertReleaseInvariants } from '../../../policy/assert-release-invariants.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..');

test('example manifest validates', () => {
  const { failures } = validateReleaseManifestFile(releasePaths(repoRoot).example);
  assert.deepEqual(failures, []);
});

test('buildReleaseManifest produces a valid manifest for a hex SHA', () => {
  const sha = 'abcdef0123456789abcdef0123456789abcdef01';
  const manifest = buildReleaseManifest(repoRoot, sha);
  assert.equal(manifest.commitSha, sha);
  assert.equal(manifest.schemaVersion, 1);
  assert.equal(manifest.images.web.digest, '');
  assert.deepEqual(validateReleaseManifest(manifest), []);
});

test('validateReleaseManifest rejects bad digest', () => {
  const sha = 'abcdef0123456789abcdef0123456789abcdef01';
  const manifest = buildReleaseManifest(repoRoot, sha);
  manifest.images.api.digest = 'not-a-digest';
  const failures = validateReleaseManifest(manifest);
  assert.ok(failures.some((f) => /images\.api\.digest/.test(f)));
});

test('assertReleaseInvariants passes on this repo', () => {
  const failures = assertReleaseInvariants(repoRoot);
  assert.deepEqual(failures, []);
});

test('assertReleaseInvariants fails when schema is missing', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ttw-068-'));
  try {
    const failures = assertReleaseInvariants(tmp);
    assert.ok(
      failures.some((f) => /release-manifest\.schema\.json/.test(f)),
      failures.join('; ')
    );
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});
