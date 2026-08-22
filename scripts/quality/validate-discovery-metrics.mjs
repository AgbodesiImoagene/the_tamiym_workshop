#!/usr/bin/env node
/**
 * Validate TTW-077 discovery measurement artefacts.
 */
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

const REQUIRED_FILES = [
  'apps/web/lib/discovery-metrics/catalogue.ts',
  'apps/web/lib/discovery-metrics/types.ts',
  'apps/web/lib/discovery-metrics/referrers.ts',
  'apps/web/lib/discovery-metrics/events.ts',
  'apps/web/lib/discovery-metrics/consent.ts',
  'apps/web/components/discovery-analytics.tsx',
  'docs/discovery/ttw-077-interim-policy.md',
];

export function validateDiscoveryMetrics({ repoRoot = process.cwd() } = {}) {
  const errors = [];
  for (const rel of REQUIRED_FILES) {
    if (!existsSync(resolve(repoRoot, rel))) {
      errors.push(`Missing required discovery metrics file: ${rel}`);
    }
  }
  return errors.map((message) => ({ kind: 'discovery-metrics', message }));
}

function main() {
  const errors = validateDiscoveryMetrics();
  if (errors.length > 0) {
    console.error('Discovery metrics validation failed:');
    for (const error of errors) {
      console.error(`  - ${error.message}`);
    }
    process.exit(1);
  }
  console.log('Discovery metrics validation passed.');
}

if (import.meta.url === new URL(process.argv[1], 'file:').href) {
  main();
}
