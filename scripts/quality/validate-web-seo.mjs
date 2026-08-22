#!/usr/bin/env node
/**
 * Validate TTW-071 web SEO foundation files exist.
 */
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

const REQUIRED_FILES = [
  'apps/web/app/robots.ts',
  'apps/web/app/sitemap.ts',
  'apps/web/lib/metadata.ts',
  'apps/web/lib/site.ts',
  'apps/web/app/auth/layout.tsx',
  'apps/web/app/orders/layout.tsx',
  'docs/discovery/ttw-071-interim-policy.md',
];

export function validateWebSeo({ repoRoot = process.cwd() } = {}) {
  const errors = [];
  for (const rel of REQUIRED_FILES) {
    if (!existsSync(resolve(repoRoot, rel))) {
      errors.push(`Missing required SEO file: ${rel}`);
    }
  }
  return errors.map((message) => ({ kind: 'web-seo', message }));
}

function main() {
  const errors = validateWebSeo();
  if (errors.length > 0) {
    console.error('Web SEO validation failed:');
    for (const error of errors) {
      console.error(`  - ${error.message}`);
    }
    process.exit(1);
  }
  console.log('Web SEO validation passed.');
}

if (import.meta.url === new URL(process.argv[1], 'file:').href) {
  main();
}
