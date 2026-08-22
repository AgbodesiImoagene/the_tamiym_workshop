/**
 * Schema validation for TTW-078 discovery gate manifest.
 */
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

export const DISCOVERY_GATE_MANIFEST_PATH = 'docs/discovery/discovery-gate-manifest.json';
export const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
export const ALLOWED_LAYERS = new Set(['unit', 'validator', 'playwright']);
export const ALLOWED_AUTOMATION = new Set(['automated', 'manual', 'blocked']);

export function loadDiscoveryGateManifest({
  manifestPath = DISCOVERY_GATE_MANIFEST_PATH,
  repoRoot = process.cwd(),
  readFile = (filePath) => readFileSync(filePath, 'utf8'),
} = {}) {
  const absolutePath = resolve(repoRoot, manifestPath);
  if (!existsSync(absolutePath)) {
    return { ok: false, error: `Missing manifest: ${manifestPath}`, manifest: null };
  }

  try {
    const manifest = JSON.parse(readFile(absolutePath));
    return { ok: true, manifest, absolutePath };
  } catch (error) {
    return {
      ok: false,
      error: `Invalid JSON in ${manifestPath}: ${error.message}`,
      manifest: null,
    };
  }
}

export function validateDiscoveryGateManifestStructure(
  manifest,
  { repoRoot = process.cwd() } = {}
) {
  const errors = [];

  if (!manifest || typeof manifest !== 'object') {
    return ['Manifest must be a JSON object'];
  }

  if (!manifest.manifest_version?.startsWith('discovery-gates/')) {
    errors.push('manifest_version must start with "discovery-gates/"');
  }

  if (manifest.ticket !== 'TTW-078') {
    errors.push(`ticket must be TTW-078, got "${manifest.ticket ?? ''}"`);
  }

  if (!ISO_DATE_RE.test(manifest.document_date ?? '')) {
    errors.push('document_date must be ISO YYYY-MM-DD');
  }

  if (!Array.isArray(manifest.entries) || manifest.entries.length === 0) {
    errors.push('entries must be a non-empty array');
    return errors;
  }

  const ids = new Set();

  for (const [index, entry] of manifest.entries.entries()) {
    const prefix = `entries[${index}]`;

    if (!entry.id) {
      errors.push(`${prefix}: missing id`);
    } else if (ids.has(entry.id)) {
      errors.push(`${prefix}: duplicate id "${entry.id}"`);
    } else {
      ids.add(entry.id);
    }

    if (!entry.invariant || typeof entry.invariant !== 'string') {
      errors.push(`${prefix}: missing invariant`);
    }

    if (!ALLOWED_LAYERS.has(entry.layer)) {
      errors.push(`${prefix}: invalid layer "${entry.layer}"`);
    }

    if (!ALLOWED_AUTOMATION.has(entry.automation)) {
      errors.push(`${prefix}: invalid automation "${entry.automation}"`);
    }

    const fileLists = ['tests', 'validators', 'playwright'];
    const hasChecks = fileLists.some((key) => Array.isArray(entry[key]) && entry[key].length > 0);
    if (entry.automation === 'automated' && !hasChecks) {
      errors.push(`${prefix}: automated entries require tests, validators, or playwright paths`);
    }

    for (const key of fileLists) {
      if (!Array.isArray(entry[key])) {
        continue;
      }
      for (const relPath of entry[key]) {
        if (!existsSync(resolve(repoRoot, relPath))) {
          errors.push(`${prefix}: missing referenced file "${relPath}"`);
        }
      }
    }
  }

  return errors;
}

export function validateDiscoveryGateManifest(options = {}) {
  const loaded = loadDiscoveryGateManifest(options);
  if (!loaded.ok) {
    return [{ kind: 'discovery-gate-manifest', message: loaded.error }];
  }

  return validateDiscoveryGateManifestStructure(loaded.manifest, options).map((message) => ({
    kind: 'discovery-gate-manifest',
    message,
  }));
}
