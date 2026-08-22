#!/usr/bin/env node
/**
 * Validate TTW-078 discovery gate manifest and contract artefacts.
 */
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { validateDiscoveryGateManifest } from './discovery-gate-manifest-schema.mjs';
import { validateAnswerContent } from './validate-answer-content.mjs';
import { validateCrawlerPolicy } from './validate-crawler-policy.mjs';
import { validateDiscoveryMetrics } from './validate-discovery-metrics.mjs';
import { validatePerformanceMedia } from './validate-performance-media.mjs';
import { validatePublicIa } from './validate-public-ia.mjs';
import { validateStructuredData } from './validate-structured-data.mjs';
import { validateWebSeo } from './validate-web-seo.mjs';

const REQUIRED_FILES = [
  'docs/discovery/discovery-gate-manifest.json',
  'docs/discovery/ttw-078-interim-policy.md',
  'tests/e2e/web/discovery.smoke.spec.ts',
  'apps/web/__tests__/discovery-gates.test.ts',
];

export function auditDiscoveryValidators({ repoRoot = process.cwd() } = {}) {
  const errors = [];
  const validators = [
    validateWebSeo,
    validatePublicIa,
    validateStructuredData,
    validateAnswerContent,
    validateCrawlerPolicy,
    validatePerformanceMedia,
    validateDiscoveryMetrics,
  ];

  for (const validate of validators) {
    const results = validate({ repoRoot });
    errors.push(...results);
  }

  return errors;
}

export function validateDiscoveryGates({ repoRoot = process.cwd() } = {}) {
  const errors = [];

  for (const rel of REQUIRED_FILES) {
    if (!existsSync(resolve(repoRoot, rel))) {
      errors.push({
        kind: 'discovery-gates',
        message: `Missing required discovery gate file: ${rel}`,
      });
    }
  }

  errors.push(...validateDiscoveryGateManifest({ repoRoot }));
  errors.push(...auditDiscoveryValidators({ repoRoot }));

  return errors;
}

function main() {
  const errors = validateDiscoveryGates();
  if (errors.length > 0) {
    console.error('Discovery gate validation failed:');
    for (const error of errors) {
      console.error(`  - ${error.message}`);
    }
    process.exit(1);
  }
  console.log('Discovery gate validation passed.');
}

if (import.meta.url === new URL(process.argv[1], 'file:').href) {
  main();
}
