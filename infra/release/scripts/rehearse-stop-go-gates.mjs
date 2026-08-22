#!/usr/bin/env node
/**
 * TTW-054 — Credential-free stop/go gate rehearsal for release manifests.
 *
 * Proves that manifests with blocking gate states cannot be promoted and that
 * approved waiver vocabulary is enforced. No database or cloud access required.
 */
import { buildReleaseManifest } from './build-release-manifest.mjs';
import { validateReleaseManifest } from './validate-release-manifest-lib.mjs';

const CRITICAL_GATES = ['infraValidate', 'migrationBaseline'];
const WAIVABLE_GATES = ['backupRecovery', 'browserUat', 'contracts', 'observability'];

/**
 * @param {Record<string, string>} gateResults
 * @returns {string[]}
 */
export function evaluateStopGo(gateResults) {
  const blocks = [];
  for (const gate of CRITICAL_GATES) {
    const status = gateResults[gate];
    if (status === 'fail' || status === 'pending' || status === 'not_run') {
      blocks.push(`${gate}=${status}`);
    }
  }
  for (const gate of WAIVABLE_GATES) {
    const status = gateResults[gate];
    if (status === 'fail') {
      blocks.push(`${gate}=fail`);
    }
  }
  return blocks;
}

/**
 * @param {string} root
 * @returns {{ passed: number; failed: number; details: string[] }}
 */
export function runStopGoRehearsal(root) {
  const sha = 'abcdef0123456789abcdef0123456789abcdef01';
  const details = [];
  let passed = 0;
  let failed = 0;

  const passManifest = buildReleaseManifest(root, sha);
  passManifest.gateResults.infraValidate = 'pass';
  passManifest.gateResults.migrationBaseline = 'pass';
  passManifest.gateResults.backupRecovery = 'owner_gated';
  const passBlocks = evaluateStopGo(passManifest.gateResults);
  if (passBlocks.length === 0 && validateReleaseManifest(passManifest).length === 0) {
    passed += 1;
    details.push('scenario:passing-gates — OK');
  } else {
    failed += 1;
    details.push(`scenario:passing-gates — FAIL ${passBlocks.join(', ')}`);
  }

  const failManifest = buildReleaseManifest(root, sha);
  failManifest.gateResults.infraValidate = 'pass';
  failManifest.gateResults.migrationBaseline = 'fail';
  const failBlocks = evaluateStopGo(failManifest.gateResults);
  if (failBlocks.includes('migrationBaseline=fail')) {
    passed += 1;
    details.push('scenario:failed-migration-gate — blocks promotion (expected)');
  } else {
    failed += 1;
    details.push('scenario:failed-migration-gate — did not block');
  }

  const pendingManifest = buildReleaseManifest(root, sha);
  pendingManifest.gateResults.migrationBaseline = 'pending';
  const pendingBlocks = evaluateStopGo(pendingManifest.gateResults);
  if (pendingBlocks.includes('migrationBaseline=pending')) {
    passed += 1;
    details.push('scenario:pending-migration-gate — blocks promotion (expected)');
  } else {
    failed += 1;
    details.push('scenario:pending-migration-gate — did not block');
  }

  const incompatibleManifest = buildReleaseManifest(root, sha);
  incompatibleManifest.gateResults.infraValidate = 'pass';
  incompatibleManifest.gateResults.migrationBaseline = 'pass';
  incompatibleManifest.gateResults.backupRecovery = 'fail';
  const backupBlocks = evaluateStopGo(incompatibleManifest.gateResults);
  if (backupBlocks.includes('backupRecovery=fail')) {
    passed += 1;
    details.push('scenario:failed-backup-gate — blocks promotion (expected)');
  } else {
    failed += 1;
    details.push('scenario:failed-backup-gate — did not block');
  }

  return { passed, failed, details };
}

function main() {
  const root = process.cwd();
  const { passed, failed, details } = runStopGoRehearsal(root);
  for (const line of details) {
    console.log(line);
  }
  if (failed > 0) {
    console.error(`Stop/go rehearsal failed (${failed} scenario(s)).`);
    process.exit(1);
  }
  console.log(`Stop/go rehearsal passed (${passed} scenario(s)).`);
}

if (import.meta.url === new URL(process.argv[1], 'file:').href) {
  main();
}
