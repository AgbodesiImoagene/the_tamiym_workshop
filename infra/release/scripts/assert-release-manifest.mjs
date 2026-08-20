#!/usr/bin/env node
/**
 * Validate a release manifest JSON file against the TTW-068 schema contract.
 *
 * Usage:
 *   node assert-release-manifest.mjs <manifest.json>
 *   node assert-release-manifest.mjs --example   # validates infra/release/manifest.example.json
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { pathToFileURL } from 'node:url';
import { releasePaths, validateReleaseManifestFile } from './validate-release-manifest-lib.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '../../..');

function main() {
  const arg = process.argv[2];
  if (!arg || arg === '--help' || arg === '-h') {
    console.error('usage: assert-release-manifest.mjs <manifest.json> | --example');
    process.exit(arg ? 0 : 2);
  }

  const target = arg === '--example' ? releasePaths(repoRoot).example : path.resolve(arg);

  const { failures } = validateReleaseManifestFile(target);
  if (failures.length) {
    console.error(`assert-release-manifest: FAILED (${target})`);
    for (const f of failures) console.error(`  - ${f}`);
    process.exit(1);
  }
  console.log(`assert-release-manifest: OK (${path.relative(repoRoot, target) || target})`);
}

const invokedAsMain =
  process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;

if (invokedAsMain) {
  main();
}
