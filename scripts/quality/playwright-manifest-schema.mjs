/**
 * Schema validation for TTW-053 PRD-to-test manifest.
 */
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

export const MANIFEST_PATH = 'docs/playwright/prd-test-manifest.json';

export const ALLOWED_AUTOMATION = new Set(['automated', 'manual', 'blocked']);
export const ALLOWED_SURFACES = new Set(['web', 'app', 'admin', 'journey', 'release']);
export const TICKET_RE = /^TTW-\d{3}$/;
export const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function loadManifest({
  manifestPath = MANIFEST_PATH,
  repoRoot = process.cwd(),
  readFile = (filePath) => readFileSync(filePath, 'utf8'),
} = {}) {
  const absolutePath = resolve(repoRoot, manifestPath);
  if (!existsSync(absolutePath)) {
    return { ok: false, error: `Missing manifest: ${manifestPath}`, manifest: null };
  }

  let manifest;
  try {
    manifest = JSON.parse(readFile(absolutePath));
  } catch (error) {
    return {
      ok: false,
      error: `Invalid JSON in ${manifestPath}: ${error.message}`,
      manifest: null,
    };
  }

  return { ok: true, manifest, absolutePath };
}

export function validateManifestStructure(manifest, { repoRoot = process.cwd() } = {}) {
  const errors = [];

  if (!manifest || typeof manifest !== 'object') {
    return ['Manifest must be a JSON object'];
  }

  if (!manifest.manifest_version?.startsWith('playwright-uat/')) {
    errors.push('manifest_version must start with "playwright-uat/"');
  }

  if (manifest.ticket !== 'TTW-053') {
    errors.push(`ticket must be TTW-053, got "${manifest.ticket ?? ''}"`);
  }

  if (!ISO_DATE_RE.test(manifest.document_date ?? '')) {
    errors.push('document_date must be ISO YYYY-MM-DD');
  }

  if (!Array.isArray(manifest.entries) || manifest.entries.length === 0) {
    errors.push('entries must be a non-empty array');
    return errors;
  }

  const ids = new Set();
  const referencedTests = new Set();

  for (const [index, entry] of manifest.entries.entries()) {
    const prefix = `entries[${index}]`;

    if (!entry.id) {
      errors.push(`${prefix}: missing id`);
    } else if (ids.has(entry.id)) {
      errors.push(`${prefix}: duplicate id "${entry.id}"`);
    } else {
      ids.add(entry.id);
    }

    if (!ALLOWED_SURFACES.has(entry.surface)) {
      errors.push(`${prefix}: invalid surface "${entry.surface}"`);
    }

    if (!entry.feature || typeof entry.feature !== 'string') {
      errors.push(`${prefix}: missing feature`);
    }

    if (!ALLOWED_AUTOMATION.has(entry.automation)) {
      errors.push(`${prefix}: invalid automation "${entry.automation}"`);
    }

    if (entry.automation === 'automated') {
      if (!Array.isArray(entry.tests) || entry.tests.length === 0) {
        errors.push(`${prefix}: automated entries require non-empty tests array`);
      } else {
        for (const testPath of entry.tests) {
          referencedTests.add(testPath);
          const absolute = resolve(repoRoot, testPath);
          if (!existsSync(absolute)) {
            errors.push(`${prefix}: missing test file "${testPath}"`);
          }
        }
      }
    }

    if (entry.automation === 'blocked') {
      if (!entry.blocked_by || !TICKET_RE.test(entry.blocked_by)) {
        errors.push(`${prefix}: blocked entries require blocked_by TTW-XXX ticket`);
      }
    }

    if (entry.automation === 'manual' && !entry.notes) {
      errors.push(`${prefix}: manual entries require notes`);
    }
  }

  return errors;
}

export function validatePlaywrightManifest(options = {}) {
  const loaded = loadManifest(options);
  if (!loaded.ok) {
    return [{ kind: 'manifest-load', message: loaded.error }];
  }

  const errors = validateManifestStructure(loaded.manifest, options).map((message) => ({
    kind: 'manifest-structure',
    message,
  }));

  return errors;
}

export function validatePlaywrightManifestOrThrow(options = {}) {
  const errors = validatePlaywrightManifest(options);
  if (errors.length > 0) {
    const message = errors.map((e) => e.message).join('\n');
    throw new Error(message);
  }
  return loadManifest(options).manifest;
}
