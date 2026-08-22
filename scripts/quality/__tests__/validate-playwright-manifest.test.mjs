import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import {
  ALLOWED_AUTOMATION,
  loadManifest,
  validateManifestStructure,
  validatePlaywrightManifest,
} from '../playwright-manifest-schema.mjs';

function writeValidManifest(root, overrides = {}) {
  const manifest = {
    manifest_version: 'playwright-uat/v1-interim-2026-08-22',
    ticket: 'TTW-053',
    document_date: '2026-08-22',
    entries: [
      {
        id: 'WEB-HOME',
        surface: 'web',
        feature: 'Home page',
        automation: 'automated',
        tests: ['tests/e2e/web/anonymous.smoke.spec.ts'],
        browser_tiers: ['smoke'],
      },
      {
        id: 'WEB-BLOCKED',
        surface: 'web',
        feature: 'Checkout',
        automation: 'blocked',
        blocked_by: 'TTW-032',
        browser_tiers: ['matrix'],
      },
      {
        id: 'STAGING-UAT',
        surface: 'release',
        feature: 'Staging UAT',
        automation: 'manual',
        notes: 'Deferred to slice 2',
        browser_tiers: ['staging'],
      },
    ],
    ...overrides,
  };

  mkdirSync(join(root, 'docs/playwright'), { recursive: true });
  mkdirSync(join(root, 'tests/e2e/web'), { recursive: true });
  writeFileSync(join(root, 'tests/e2e/web/anonymous.smoke.spec.ts'), '// spec\n');
  writeFileSync(
    join(root, 'docs/playwright/prd-test-manifest.json'),
    `${JSON.stringify(manifest, null, 2)}\n`
  );
}

test('ALLOWED_AUTOMATION includes automated manual blocked', () => {
  assert.ok(ALLOWED_AUTOMATION.has('automated'));
  assert.ok(ALLOWED_AUTOMATION.has('manual'));
  assert.ok(ALLOWED_AUTOMATION.has('blocked'));
});

test('validateManifestStructure rejects missing automated test files', () => {
  const root = mkdtempSync(join(tmpdir(), 'ttw-pw-manifest-'));
  try {
    writeValidManifest(root);
    const { manifest } = loadManifest({ repoRoot: root });
    const errors = validateManifestStructure(manifest, { repoRoot: root });
    assert.equal(errors.length, 0);

    manifest.entries[0].tests = ['tests/e2e/web/missing.spec.ts'];
    const missingErrors = validateManifestStructure(manifest, { repoRoot: root });
    assert.ok(missingErrors.some((e) => e.includes('missing test file')));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('validateManifestStructure rejects blocked entries without ticket', () => {
  const root = mkdtempSync(join(tmpdir(), 'ttw-pw-manifest-'));
  try {
    writeValidManifest(root);
    const { manifest } = loadManifest({ repoRoot: root });
    manifest.entries[1].blocked_by = 'invalid';
    const errors = validateManifestStructure(manifest, { repoRoot: root });
    assert.ok(errors.some((e) => e.includes('blocked_by')));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('validatePlaywrightManifest passes for repository manifest', () => {
  const errors = validatePlaywrightManifest();
  assert.equal(errors.length, 0);
});
