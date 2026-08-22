#!/usr/bin/env node
/**
 * Validate TTW-075 crawler governance artefacts.
 */
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

const REQUIRED_FILES = [
  'apps/web/lib/crawler-policy/matrix.ts',
  'apps/web/lib/crawler-policy/types.ts',
  'apps/web/app/llms.txt/route.ts',
  'docs/discovery/ttw-075-interim-policy.md',
];

export function validateCrawlerPolicy({ repoRoot = process.cwd() } = {}) {
  const errors = [];
  for (const rel of REQUIRED_FILES) {
    if (!existsSync(resolve(repoRoot, rel))) {
      errors.push(`Missing required crawler policy file: ${rel}`);
    }
  }
  return errors.map((message) => ({ kind: 'crawler-policy', message }));
}

function main() {
  const errors = validateCrawlerPolicy();
  if (errors.length > 0) {
    console.error('Crawler policy validation failed:');
    for (const error of errors) {
      console.error(`  - ${error.message}`);
    }
    process.exit(1);
  }
  console.log('Crawler policy validation passed.');
}

if (import.meta.url === new URL(process.argv[1], 'file:').href) {
  main();
}
