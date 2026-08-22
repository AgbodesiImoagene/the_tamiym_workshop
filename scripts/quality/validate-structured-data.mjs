#!/usr/bin/env node
/**
 * Validate TTW-073 structured data foundation files exist.
 */
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

const REQUIRED_FILES = [
  'apps/web/lib/structured-data/builders.ts',
  'apps/web/lib/structured-data/constants.ts',
  'apps/web/components/json-ld.tsx',
  'docs/discovery/ttw-073-interim-policy.md',
];

export function validateStructuredData({ repoRoot = process.cwd() } = {}) {
  const errors = [];
  for (const rel of REQUIRED_FILES) {
    if (!existsSync(resolve(repoRoot, rel))) {
      errors.push(`Missing required structured data file: ${rel}`);
    }
  }
  return errors.map((message) => ({ kind: 'structured-data', message }));
}

function main() {
  const errors = validateStructuredData();
  if (errors.length > 0) {
    console.error('Structured data validation failed:');
    for (const error of errors) {
      console.error(`  - ${error.message}`);
    }
    process.exit(1);
  }
  console.log('Structured data validation passed.');
}

if (import.meta.url === new URL(process.argv[1], 'file:').href) {
  main();
}
