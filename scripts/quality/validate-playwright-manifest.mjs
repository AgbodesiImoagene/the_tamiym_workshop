#!/usr/bin/env node
/**
 * Validate TTW-053 PRD-to-test manifest structure and referenced spec files.
 *
 * Usage:
 *   node scripts/quality/validate-playwright-manifest.mjs
 */
import { validatePlaywrightManifest } from './playwright-manifest-schema.mjs';

const errors = validatePlaywrightManifest();

if (errors.length > 0) {
  console.error('Playwright manifest validation failed:');
  for (const error of errors) {
    console.error(`  - ${error.message}`);
  }
  process.exit(1);
}

console.log('Playwright manifest validation passed.');
