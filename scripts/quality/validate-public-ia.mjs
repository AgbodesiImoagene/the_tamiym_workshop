#!/usr/bin/env node
/**
 * Validate TTW-072 public IA registry and required files.
 */
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

const REQUIRED_FILES = [
  'apps/web/lib/public-ia.ts',
  'apps/web/lib/content/registry.ts',
  'apps/web/lib/content/types.ts',
  'apps/web/components/marketing-breadcrumbs.tsx',
  'apps/web/app/solutions/bulk/page.tsx',
  'docs/discovery/ttw-072-interim-policy.md',
];

export function validatePublicIa({ repoRoot = process.cwd() } = {}) {
  const errors = [];
  for (const rel of REQUIRED_FILES) {
    if (!existsSync(resolve(repoRoot, rel))) {
      errors.push(`Missing required public IA file: ${rel}`);
    }
  }
  return errors.map((message) => ({ kind: 'public-ia', message }));
}

function main() {
  const errors = validatePublicIa();
  if (errors.length > 0) {
    console.error('Public IA validation failed:');
    for (const error of errors) {
      console.error(`  - ${error.message}`);
    }
    process.exit(1);
  }
  console.log('Public IA validation passed.');
}

if (import.meta.url === new URL(process.argv[1], 'file:').href) {
  main();
}
