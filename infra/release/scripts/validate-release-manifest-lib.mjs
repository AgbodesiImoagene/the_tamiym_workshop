#!/usr/bin/env node
/**
 * Shared release-manifest validation (credential-free, no secrets).
 * Implements the checks required by infra/release/release-manifest.schema.json
 * without adding a JSON Schema runtime dependency.
 */
import fs from 'node:fs';
import path from 'node:path';

const GATE_STATUSES = new Set([
  'pass',
  'fail',
  'pending',
  'not_run',
  'owner_gated',
  'scoped_elsewhere',
]);

const IMAGE_NAMES = ['web', 'app', 'admin', 'api'];

const COMMIT_SHA_RE = /^[0-9a-fA-F]{7,64}$|^PLACEHOLDER(_[A-Z0-9_]+)?$/;
const DIGEST_RE = /^(sha256:[a-fA-F0-9]{64})?$|^PLACEHOLDER(_[A-Z0-9_]+)?$/;
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/;

/**
 * @param {unknown} value
 * @param {string} label
 * @param {string[]} failures
 */
function requireObject(value, label, failures) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    failures.push(`${label}: must be an object`);
    return false;
  }
  return true;
}

/**
 * Validate a release manifest object against the TTW-068 schema contract.
 * @param {unknown} manifest
 * @returns {string[]} failure messages
 */
export function validateReleaseManifest(manifest) {
  const failures = [];

  if (!requireObject(manifest, 'manifest', failures)) {
    return failures;
  }

  /** @type {Record<string, unknown>} */
  const m = /** @type {Record<string, unknown>} */ (manifest);

  if (m.schemaVersion !== 1) {
    failures.push('schemaVersion: must be integer const 1');
  }

  if (typeof m.commitSha !== 'string' || !COMMIT_SHA_RE.test(m.commitSha)) {
    failures.push(
      'commitSha: must be a 7–64 hex SHA or PLACEHOLDER(_…); got ' + JSON.stringify(m.commitSha)
    );
  }

  if (typeof m.createdAt !== 'string' || !ISO_DATE_RE.test(m.createdAt)) {
    failures.push('createdAt: must be an ISO-8601 date-time string');
  } else {
    const parsed = Date.parse(m.createdAt);
    if (Number.isNaN(parsed)) {
      failures.push('createdAt: not a parseable date');
    }
  }

  if (m.ticket !== undefined) {
    if (typeof m.ticket !== 'string' || !/^TTW-[0-9]{3}$/.test(m.ticket)) {
      failures.push('ticket: must match TTW-XXX when present');
    }
  }

  if (m.notes !== undefined && typeof m.notes !== 'string') {
    failures.push('notes: must be a string when present');
  }

  if (m.artefactChecksums !== undefined) {
    if (!requireObject(m.artefactChecksums, 'artefactChecksums', failures)) {
      // skip nested
    } else {
      const ac = /** @type {Record<string, unknown>} */ (m.artefactChecksums);
      const allowed = [
        'pnpmLockSha256',
        'openApiSha256',
        'playwrightManifestVersion',
        'prismaMigrationCount',
      ];
      for (const key of allowed) {
        if (ac[key] === undefined) continue;
        if (key === 'prismaMigrationCount') {
          if (typeof ac[key] !== 'number' || ac[key] < 0) {
            failures.push('artefactChecksums.prismaMigrationCount: must be a non-negative number');
          }
        } else if (typeof ac[key] !== 'string' || ac[key].length < 1) {
          failures.push(`artefactChecksums.${key}: must be a non-empty string`);
        }
      }
      for (const key of Object.keys(ac)) {
        if (!allowed.includes(key)) {
          failures.push(`artefactChecksums: unexpected property ${key}`);
        }
      }
    }
  }

  const allowedTop = new Set([
    'schemaVersion',
    'ticket',
    'commitSha',
    'createdAt',
    'artefactChecksums',
    'images',
    'sbomRefs',
    'opentofu',
    'gateResults',
    'notes',
  ]);
  for (const key of Object.keys(m)) {
    if (!allowedTop.has(key)) {
      failures.push(`unexpected top-level property: ${key}`);
    }
  }

  if (!requireObject(m.images, 'images', failures)) {
    // skip nested
  } else {
    const images = /** @type {Record<string, unknown>} */ (m.images);
    for (const name of IMAGE_NAMES) {
      if (!requireObject(images[name], `images.${name}`, failures)) continue;
      const img = /** @type {Record<string, unknown>} */ (images[name]);
      if (typeof img.digest !== 'string' || !DIGEST_RE.test(img.digest)) {
        failures.push(
          `images.${name}.digest: must be sha256:…, empty, or PLACEHOLDER; got ${JSON.stringify(img.digest)}`
        );
      }
      for (const opt of ['repository', 'tag']) {
        if (img[opt] !== undefined && typeof img[opt] !== 'string') {
          failures.push(`images.${name}.${opt}: must be a string when present`);
        }
      }
      for (const key of Object.keys(img)) {
        if (!['digest', 'repository', 'tag'].includes(key)) {
          failures.push(`images.${name}: unexpected property ${key}`);
        }
      }
    }
    for (const key of Object.keys(images)) {
      if (!IMAGE_NAMES.includes(key)) {
        failures.push(`images: unexpected property ${key}`);
      }
    }
  }

  if (!requireObject(m.sbomRefs, 'sbomRefs', failures)) {
    // skip
  } else {
    const sbom = /** @type {Record<string, unknown>} */ (m.sbomRefs);
    for (const name of IMAGE_NAMES) {
      if (typeof sbom[name] !== 'string') {
        failures.push(`sbomRefs.${name}: must be a string (may be empty or PLACEHOLDER)`);
      }
    }
    for (const key of Object.keys(sbom)) {
      if (!IMAGE_NAMES.includes(key)) {
        failures.push(`sbomRefs: unexpected property ${key}`);
      }
    }
  }

  if (!requireObject(m.opentofu, 'opentofu', failures)) {
    // skip
  } else {
    const ot = /** @type {Record<string, unknown>} */ (m.opentofu);
    if (!requireObject(ot.lockfileHashes, 'opentofu.lockfileHashes', failures)) {
      // skip
    } else {
      const hashes = /** @type {Record<string, unknown>} */ (ot.lockfileHashes);
      if (Object.keys(hashes).length < 1) {
        failures.push('opentofu.lockfileHashes: must contain at least one entry');
      }
      for (const [k, v] of Object.entries(hashes)) {
        if (typeof v !== 'string' || v.length < 1) {
          failures.push(`opentofu.lockfileHashes[${k}]: must be a non-empty string`);
        }
      }
    }
    if (typeof ot.planChecksum !== 'string' || ot.planChecksum.length < 1) {
      failures.push('opentofu.planChecksum: must be a non-empty string (PLACEHOLDER allowed)');
    }
    for (const key of Object.keys(ot)) {
      if (!['lockfileHashes', 'planChecksum'].includes(key)) {
        failures.push(`opentofu: unexpected property ${key}`);
      }
    }
  }

  if (!requireObject(m.gateResults, 'gateResults', failures)) {
    // skip
  } else {
    const gates = /** @type {Record<string, unknown>} */ (m.gateResults);
    const requiredGates = [
      'infraValidate',
      'contracts',
      'observability',
      'browserUat',
      'backupRecovery',
      'migrationBaseline',
    ];
    for (const g of requiredGates) {
      if (typeof gates[g] !== 'string' || !GATE_STATUSES.has(gates[g])) {
        failures.push(
          `gateResults.${g}: must be one of ${[...GATE_STATUSES].join('|')}; got ${JSON.stringify(gates[g])}`
        );
      }
    }
    for (const key of Object.keys(gates)) {
      if (!requiredGates.includes(key)) {
        failures.push(`gateResults: unexpected property ${key}`);
      }
    }
  }

  return failures;
}

/**
 * @param {string} filePath
 * @returns {{ manifest: unknown, failures: string[] }}
 */
export function validateReleaseManifestFile(filePath) {
  if (!fs.existsSync(filePath)) {
    return { manifest: null, failures: [`missing file: ${filePath}`] };
  }
  let manifest;
  try {
    manifest = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (err) {
    return {
      manifest: null,
      failures: [`${filePath}: invalid JSON (${err instanceof Error ? err.message : err})`],
    };
  }
  return { manifest, failures: validateReleaseManifest(manifest) };
}

/**
 * Resolve default paths under a repo root.
 * @param {string} root
 */
export function releasePaths(root) {
  return {
    schema: path.join(root, 'infra/release/release-manifest.schema.json'),
    example: path.join(root, 'infra/release/manifest.example.json'),
    teardownPolicy: path.join(root, 'infra/release/teardown-policy.json'),
    workflow: path.join(root, '.github/workflows/release-candidate.yml'),
  };
}
