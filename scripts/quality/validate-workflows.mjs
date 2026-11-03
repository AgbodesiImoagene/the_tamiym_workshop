#!/usr/bin/env node
/**
 * Validate TTW-006 GitHub Actions workflow syntax.
 *
 * GitHub rejects an unparsable workflow file only at run time ("Invalid
 * workflow file"), so a dispatch-only workflow can stay broken unnoticed. This
 * parses every workflow and fails on YAML errors or a missing `on`/`jobs`.
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { isMap, parseDocument } from 'yaml';

const WORKFLOWS_DIR = '.github/workflows';
const REQUIRED_KEYS = ['on', 'jobs'];

export function validateWorkflows({ repoRoot = process.cwd() } = {}) {
  const dir = resolve(repoRoot, WORKFLOWS_DIR);
  if (!existsSync(dir)) {
    return [{ kind: 'workflow', message: `Missing workflow directory: ${WORKFLOWS_DIR}` }];
  }
  const errors = [];
  const files = readdirSync(dir)
    .filter((name) => /\.ya?ml$/.test(name))
    .sort();
  for (const name of files) {
    const rel = join(WORKFLOWS_DIR, name);
    const doc = parseDocument(readFileSync(join(dir, name), 'utf8'));
    if (doc.errors.length > 0) {
      for (const error of doc.errors) {
        const line = error.linePos?.[0]?.line ?? '?';
        errors.push(`${rel}:${line}: invalid YAML (${error.code})`);
      }
      continue;
    }
    if (!isMap(doc.contents)) {
      errors.push(`${rel}: workflow must be a YAML mapping`);
      continue;
    }
    for (const key of REQUIRED_KEYS) {
      if (!doc.contents.has(key)) {
        errors.push(`${rel}: missing required top-level key "${key}"`);
      }
    }
  }
  return errors.map((message) => ({ kind: 'workflow', message }));
}

function main() {
  const errors = validateWorkflows();
  if (errors.length > 0) {
    console.error('Workflow validation failed:');
    for (const error of errors) {
      console.error(`  - ${error.message}`);
    }
    process.exit(1);
  }
  console.log('Workflow validation passed.');
}

if (import.meta.url === new URL(process.argv[1], 'file:').href) {
  main();
}
