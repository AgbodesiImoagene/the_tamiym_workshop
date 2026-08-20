#!/usr/bin/env node
/**
 * Build a release manifest from git SHA + optional image digest env vars.
 * Credential-free: never reads secrets; digests may be empty when images are not pushed.
 *
 * Env (optional digests):
 *   RELEASE_IMAGE_DIGEST_WEB
 *   RELEASE_IMAGE_DIGEST_APP
 *   RELEASE_IMAGE_DIGEST_ADMIN
 *   RELEASE_IMAGE_DIGEST_API
 *   RELEASE_SBOM_REF_WEB / _APP / _ADMIN / _API
 *   RELEASE_PLAN_CHECKSUM
 *   RELEASE_TICKET (default TTW-068)
 *
 * Usage:
 *   node build-release-manifest.mjs [--out path] [--commit SHA] [--root REPO]
 *   Writes JSON to stdout when --out omitted.
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { validateReleaseManifest } from './validate-release-manifest-lib.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * @param {string[]} argv
 */
function parseArgs(argv) {
  /** @type {{ out: string | null, commit: string | null, root: string | null }} */
  const opts = { out: null, commit: null, root: null };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--out') opts.out = argv[++i] ?? null;
    else if (a === '--commit') opts.commit = argv[++i] ?? null;
    else if (a === '--root') opts.root = argv[++i] ?? null;
    else if (a === '--help' || a === '-h') {
      console.log(`usage: build-release-manifest.mjs [--out path] [--commit SHA] [--root REPO]`);
      process.exit(0);
    } else {
      console.error(`unknown argument: ${a}`);
      process.exit(2);
    }
  }
  return opts;
}

/**
 * @param {string} root
 * @param {string} rel
 */
function sha256File(root, rel) {
  const full = path.join(root, rel);
  if (!fs.existsSync(full)) {
    return 'PLACEHOLDER_LOCK_HASH';
  }
  const hash = crypto.createHash('sha256');
  hash.update(fs.readFileSync(full));
  return hash.digest('hex');
}

/**
 * @param {string} root
 * @param {string | null} commitOverride
 */
function resolveCommitSha(root, commitOverride) {
  if (commitOverride && commitOverride.trim()) {
    return commitOverride.trim();
  }
  if (process.env.GITHUB_SHA && /^[0-9a-fA-F]{7,64}$/.test(process.env.GITHUB_SHA)) {
    return process.env.GITHUB_SHA;
  }
  try {
    return execFileSync('git', ['rev-parse', 'HEAD'], {
      cwd: root,
      encoding: 'utf8',
    }).trim();
  } catch {
    return 'PLACEHOLDER_COMMIT_SHA';
  }
}

/**
 * @param {string} envName
 * @param {string} fallback
 */
function envOr(envName, fallback) {
  const v = process.env[envName];
  if (v === undefined || v === null) return fallback;
  return String(v);
}

/**
 * @param {string} root
 * @param {string} commitSha
 */
export function buildReleaseManifest(root, commitSha) {
  const digest = (name) => envOr(`RELEASE_IMAGE_DIGEST_${name.toUpperCase()}`, '');
  const sbom = (name) => envOr(`RELEASE_SBOM_REF_${name.toUpperCase()}`, '');

  const manifest = {
    schemaVersion: 1,
    ticket: envOr('RELEASE_TICKET', 'TTW-068'),
    commitSha,
    createdAt: new Date().toISOString(),
    images: {
      web: { digest: digest('web'), tag: envOr('RELEASE_IMAGE_TAG_WEB', '') },
      app: { digest: digest('app'), tag: envOr('RELEASE_IMAGE_TAG_APP', '') },
      admin: { digest: digest('admin'), tag: envOr('RELEASE_IMAGE_TAG_ADMIN', '') },
      api: { digest: digest('api'), tag: envOr('RELEASE_IMAGE_TAG_API', '') },
    },
    sbomRefs: {
      web: sbom('web'),
      app: sbom('app'),
      admin: sbom('admin'),
      api: sbom('api'),
    },
    opentofu: {
      lockfileHashes: {
        'infra/envs/production/.terraform.lock.hcl': sha256File(
          root,
          'infra/envs/production/.terraform.lock.hcl'
        ),
        'infra/envs/temporary-validation/.terraform.lock.hcl': sha256File(
          root,
          'infra/envs/temporary-validation/.terraform.lock.hcl'
        ),
      },
      planChecksum: envOr('RELEASE_PLAN_CHECKSUM', 'PLACEHOLDER_PLAN_CHECKSUM'),
    },
    gateResults: {
      infraValidate: envOr('RELEASE_GATE_INFRA', 'pending'),
      contracts: envOr('RELEASE_GATE_CONTRACTS', 'scoped_elsewhere'),
      observability: envOr('RELEASE_GATE_OBSERVABILITY', 'scoped_elsewhere'),
      browserUat: envOr('RELEASE_GATE_BROWSER', 'scoped_elsewhere'),
      backupRecovery: envOr('RELEASE_GATE_BACKUP', 'owner_gated'),
    },
  };

  // Drop empty optional tag strings so example-style manifests stay lean when unset.
  for (const name of ['web', 'app', 'admin', 'api']) {
    if (!manifest.images[name].tag) {
      delete manifest.images[name].tag;
    }
  }

  return manifest;
}

function main() {
  const opts = parseArgs(process.argv.slice(2));
  const root = opts.root || path.resolve(__dirname, '../../..') || process.cwd();
  const commitSha = resolveCommitSha(root, opts.commit);
  const manifest = buildReleaseManifest(root, commitSha);
  const failures = validateReleaseManifest(manifest);
  if (failures.length) {
    console.error('build-release-manifest: validation failed');
    for (const f of failures) console.error(`  - ${f}`);
    process.exit(1);
  }
  const json = `${JSON.stringify(manifest, null, 2)}\n`;
  if (opts.out) {
    fs.mkdirSync(path.dirname(path.resolve(opts.out)), { recursive: true });
    fs.writeFileSync(opts.out, json, 'utf8');
    console.error(`build-release-manifest: wrote ${opts.out}`);
  } else {
    process.stdout.write(json);
  }
}

const invokedAsMain =
  process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;

if (invokedAsMain) {
  main();
}
