#!/usr/bin/env node
/**
 * Credential-free release preflight checks (TTW-054).
 * Verifies required artefacts and toolchain contracts exist before manifest promotion.
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { checkMigrationArtefacts } from './check-migration-artefacts.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const defaultRoot = path.resolve(__dirname, '../../..');

/**
 * @param {string} root
 * @param {string} rel
 */
function mustExist(root, rel) {
  const full = path.join(root, rel);
  if (!fs.existsSync(full)) {
    return `Missing required file: ${rel}`;
  }
  return null;
}

/**
 * @param {string} root
 */
export function runReleasePreflight(root = defaultRoot) {
  const errors = [];

  const requiredFiles = [
    'infra/release/release-manifest.schema.json',
    'infra/release/teardown-policy.json',
    'docs/openapi/openapi.json',
    'docker/observability/prometheus/alerts.yml',
    'docs/playwright/prd-test-manifest.json',
    'docs/release/ttw-054-interim-policy.md',
    'docs/release/controlled-release-checklist.md',
    'docs/runbooks/release-preflight.md',
    'docs/runbooks/release-migration.md',
    'docs/runbooks/release-rollback-rollforward.md',
    '.nvmrc',
    'pnpm-lock.yaml',
  ];

  for (const rel of requiredFiles) {
    const err = mustExist(root, rel);
    if (err) errors.push(err);
  }

  const nvmrc = fs.readFileSync(path.join(root, '.nvmrc'), 'utf8').trim();
  const nodeMajor = process.versions.node.split('.')[0];
  if (!nvmrc.includes(nodeMajor)) {
    errors.push(`Node major ${nodeMajor} does not match .nvmrc (${nvmrc})`);
  }

  errors.push(...checkMigrationArtefacts(root));

  return errors;
}

function main() {
  const errors = runReleasePreflight();
  if (errors.length > 0) {
    console.error('Release preflight failed:');
    for (const err of errors) {
      console.error(`  - ${err}`);
    }
    process.exit(1);
  }
  console.log('Release preflight passed.');
}

if (import.meta.url === new URL(process.argv[1], 'file:').href) {
  main();
}

/**
 * @param {string} root
 * @param {string} rel
 */
export function sha256FileHex(root, rel) {
  const full = path.join(root, rel);
  if (!fs.existsSync(full)) {
    return '';
  }
  const hash = crypto.createHash('sha256');
  hash.update(fs.readFileSync(full));
  return hash.digest('hex');
}
