#!/usr/bin/env node
/**
 * Validate TTW-074 answer-ready content library.
 */
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

const REQUIRED_FILES = [
  'apps/web/lib/content/answers/registry.ts',
  'apps/web/lib/content/answers/fundraiser.ts',
  'apps/web/components/answer-section.tsx',
  'apps/web/components/page-answers.tsx',
  'apps/web/app/guides/how-fundraising-works/page.tsx',
  'docs/discovery/ttw-074-interim-policy.md',
];

export function validateAnswerContent({ repoRoot = process.cwd() } = {}) {
  const errors = [];
  for (const rel of REQUIRED_FILES) {
    if (!existsSync(resolve(repoRoot, rel))) {
      errors.push(`Missing required answer content file: ${rel}`);
    }
  }
  return errors.map((message) => ({ kind: 'answer-content', message }));
}

function main() {
  const errors = validateAnswerContent();
  if (errors.length > 0) {
    console.error('Answer content validation failed:');
    for (const error of errors) {
      console.error(`  - ${error.message}`);
    }
    process.exit(1);
  }
  console.log('Answer content validation passed.');
}

if (import.meta.url === new URL(process.argv[1], 'file:').href) {
  main();
}
