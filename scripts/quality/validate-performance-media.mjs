#!/usr/bin/env node
/**
 * Validate TTW-076 performance and media discoverability artefacts.
 */
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

const REQUIRED_FILES = [
  'apps/web/lib/media/registry.ts',
  'apps/web/lib/media/types.ts',
  'apps/web/lib/media/social.ts',
  'apps/web/lib/media/budgets.ts',
  'apps/web/public/assets/marketing/og-default.jpg',
  'docs/discovery/ttw-076-interim-policy.md',
];

export function validatePerformanceMedia({ repoRoot = process.cwd() } = {}) {
  const errors = [];
  for (const rel of REQUIRED_FILES) {
    if (!existsSync(resolve(repoRoot, rel))) {
      errors.push(`Missing required performance/media file: ${rel}`);
    }
  }
  return errors.map((message) => ({ kind: 'performance-media', message }));
}

function main() {
  const errors = validatePerformanceMedia();
  if (errors.length > 0) {
    console.error('Performance/media validation failed:');
    for (const error of errors) {
      console.error(`  - ${error.message}`);
    }
    process.exit(1);
  }
  console.log('Performance/media validation passed.');
}

if (import.meta.url === new URL(process.argv[1], 'file:').href) {
  main();
}
