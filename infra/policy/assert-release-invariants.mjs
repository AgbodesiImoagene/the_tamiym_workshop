#!/usr/bin/env node
/**
 * Credential-free release / ephemeral-env invariant checks for TTW-068.
 *
 * Fails if:
 * - release manifest schema or example is missing / invalid
 * - teardown policy missing max_lifetime_hours
 * - release-candidate workflow is not workflow_dispatch-only (no pull_request)
 * - production auto-apply is claimed enabled in teardown policy
 *
 * Usage: node assert-release-invariants.mjs <repo-root>
 */
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  releasePaths,
  validateReleaseManifestFile,
} from '../release/scripts/validate-release-manifest-lib.mjs';

/**
 * @param {string} root
 * @returns {string[]} failure messages
 */
export function assertReleaseInvariants(root) {
  const failures = [];
  const paths = releasePaths(root);

  function mustExist(full, label) {
    if (!fs.existsSync(full)) {
      failures.push(`missing required file: ${label}`);
      return false;
    }
    return true;
  }

  if (!mustExist(paths.schema, 'infra/release/release-manifest.schema.json')) {
    return failures;
  }
  if (!mustExist(paths.example, 'infra/release/manifest.example.json')) {
    return failures;
  }
  if (!mustExist(paths.teardownPolicy, 'infra/release/teardown-policy.json')) {
    return failures;
  }
  if (!mustExist(paths.workflow, '.github/workflows/release-candidate.yml')) {
    return failures;
  }

  // Schema must look like a JSON Schema document for release manifests.
  try {
    const schema = JSON.parse(fs.readFileSync(paths.schema, 'utf8'));
    if (schema.title !== 'Tamiym Workshop release manifest') {
      failures.push('infra/release/release-manifest.schema.json: unexpected title');
    }
    const required = schema.required || [];
    for (const key of [
      'schemaVersion',
      'commitSha',
      'createdAt',
      'images',
      'sbomRefs',
      'opentofu',
      'gateResults',
    ]) {
      if (!required.includes(key)) {
        failures.push(`infra/release/release-manifest.schema.json: required must include ${key}`);
      }
    }
  } catch (err) {
    failures.push(`infra/release/release-manifest.schema.json: invalid JSON (${err.message})`);
  }

  const { failures: exampleFailures } = validateReleaseManifestFile(paths.example);
  for (const f of exampleFailures) {
    failures.push(`manifest.example.json: ${f}`);
  }

  // Teardown policy
  try {
    const policy = JSON.parse(fs.readFileSync(paths.teardownPolicy, 'utf8'));
    if (policy.ticket !== 'TTW-068') {
      failures.push('teardown-policy.json: ticket must be "TTW-068"');
    }
    if (
      typeof policy.max_lifetime_hours !== 'number' ||
      !(policy.max_lifetime_hours > 0) ||
      policy.max_lifetime_hours > 72
    ) {
      failures.push('teardown-policy.json: max_lifetime_hours must be a number in (0, 72]');
    }
    if (typeof policy.max_monthly_usd !== 'number' || !(policy.max_monthly_usd > 0)) {
      failures.push('teardown-policy.json: max_monthly_usd must be a positive number');
    }
    if (policy.production_auto_apply !== false) {
      failures.push('teardown-policy.json: production_auto_apply must be false (TTW-054 handoff)');
    }
    if (policy.owner_gated_live_apply !== true) {
      failures.push('teardown-policy.json: owner_gated_live_apply must be true');
    }
    if (
      !policy.orphan_detection ||
      !Array.isArray(policy.orphan_detection.notes) ||
      policy.orphan_detection.notes.length < 1
    ) {
      failures.push('teardown-policy.json: orphan_detection.notes required');
    }
  } catch (err) {
    failures.push(`teardown-policy.json: invalid JSON (${err.message})`);
  }

  // Workflow trust model: workflow_dispatch only; never pull_request.
  const workflow = fs.readFileSync(paths.workflow, 'utf8');
  if (!/^name:\s*Release Candidate/m.test(workflow)) {
    failures.push('release-candidate.yml: expected workflow name "Release Candidate"');
  }
  if (!/workflow_dispatch:/.test(workflow)) {
    failures.push('release-candidate.yml: must use workflow_dispatch');
  }
  if (/^\s*pull_request\s*:/m.test(workflow) || /\npull_request:/.test(workflow)) {
    failures.push('release-candidate.yml: must NOT trigger on pull_request (untrusted heads)');
  }
  if (!/enable_live_tmpval/.test(workflow)) {
    failures.push('release-candidate.yml: must document/gate enable_live_tmpval (fail-closed)');
  }
  if (!/validate-all\.sh/.test(workflow)) {
    failures.push('release-candidate.yml: validate-infra must reuse validate-all.sh');
  }
  if (!/build-release-manifest\.mjs/.test(workflow)) {
    failures.push('release-candidate.yml: assemble-manifest must run build-release-manifest.mjs');
  }

  // Builder / assert scripts must exist
  for (const rel of [
    'infra/release/scripts/build-release-manifest.mjs',
    'infra/release/scripts/assert-release-manifest.mjs',
    'infra/release/scripts/validate-release-manifest-lib.mjs',
  ]) {
    if (!fs.existsSync(path.join(root, rel))) {
      failures.push(`missing required file: ${rel}`);
    }
  }

  // Doc must exist and mention residual TTW-050/053 honesty
  const docRel = 'docs/infrastructure/ttw-068-ephemeral-release.md';
  const docFull = path.join(root, docRel);
  if (!fs.existsSync(docFull)) {
    failures.push(`missing required file: ${docRel}`);
  } else {
    const doc = fs.readFileSync(docFull, 'utf8');
    for (const needle of [
      'build once',
      'promote by digest',
      'TTW-054',
      'TTW-050',
      'TTW-053',
      'owner-gated',
      'max_lifetime',
      'orphan',
    ]) {
      if (!doc.toLowerCase().includes(needle.toLowerCase())) {
        failures.push(`${docRel}: must document "${needle}"`);
      }
    }
  }

  return failures;
}

function main(root) {
  if (!root) {
    console.error('usage: assert-release-invariants.mjs <repo-root>');
    process.exit(2);
  }
  const failures = assertReleaseInvariants(root);
  if (failures.length) {
    console.error('assert-release-invariants: FAILED');
    for (const f of failures) console.error(`  - ${f}`);
    process.exit(1);
  }
  console.log('assert-release-invariants: OK');
}

const invokedAsMain =
  process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;

if (invokedAsMain) {
  main(process.argv[2]);
}
