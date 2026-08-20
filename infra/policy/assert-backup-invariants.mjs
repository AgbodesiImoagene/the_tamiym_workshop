#!/usr/bin/env node
/**
 * Credential-free backup / DR invariant checks for TTW-067.
 *
 * Fails if:
 * - policy.json missing required schema fields / RPO-RTO numbers
 * - RPO/RTO not documented in the TTW-067 infrastructure doc
 * - required runbooks or scripts missing / not executable
 * - tracked backup artefacts appear to contain secrets
 * - backup_stale alert linkage missing
 *
 * Usage: node assert-backup-invariants.mjs <repo-root>
 */
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const POLICY_REL = 'infra/runtime/backup/policy.json';
const DOCS_REL = 'docs/infrastructure/ttw-067-backup-disaster-recovery.md';
const INVARIANTS_SQL_REL = 'infra/runtime/backup/invariants/post-restore-queries.sql';
const CATALOG_REL = 'infra/runtime/observability/alerts/catalog.json';

const REQUIRED_RUNBOOKS = [
  'infra/runtime/backup/runbooks/droplet-loss.md',
  'infra/runtime/backup/runbooks/postgres-restore.md',
  'infra/runtime/backup/runbooks/region-loss.md',
  'infra/runtime/backup/runbooks/valkey-loss.md',
  'infra/runtime/backup/runbooks/failback.md',
];

const REQUIRED_SCRIPTS = [
  'infra/runtime/backup/scripts/pg-logical-export.sh',
  'infra/runtime/backup/scripts/spaces-inventory-export.sh',
  'infra/runtime/backup/scripts/restore-isolated-check.sh',
];

const SECRET_PATTERNS = [
  /dop_v1_[A-Za-z0-9_]{20,}/,
  /DIGITALOCEAN_TOKEN\s*[:=]\s*["']?(?!PLACEHOLDER|CHANGE_ME|\$\{)[A-Za-z0-9_]{16,}/,
  /postgres(ql)?:\/\/[^:\s]+:[^@\s]+@/i,
  /AKIA[0-9A-Z]{16}/,
  /-----BEGIN (RSA |OPENSSH |EC )?PRIVATE KEY-----/,
];

/**
 * @param {string} root
 * @returns {string[]} failure messages
 */
export function assertBackupInvariants(root) {
  const failures = [];

  function mustExist(rel) {
    const full = path.join(root, rel);
    if (!fs.existsSync(full)) {
      failures.push(`missing required file: ${rel}`);
      return false;
    }
    return true;
  }

  function read(rel) {
    return fs.readFileSync(path.join(root, rel), 'utf8');
  }

  if (!mustExist(POLICY_REL) || !mustExist(DOCS_REL) || !mustExist(INVARIANTS_SQL_REL)) {
    return failures;
  }

  let policy;
  try {
    policy = JSON.parse(read(POLICY_REL));
  } catch (err) {
    failures.push(`${POLICY_REL}: invalid JSON (${err.message})`);
    return failures;
  }

  if (policy.ticket !== 'TTW-067') {
    failures.push(`${POLICY_REL}: ticket must be "TTW-067"`);
  }
  if (!policy.objectives || typeof policy.objectives !== 'object') {
    failures.push(`${POLICY_REL}: objectives object required`);
  } else {
    const recoverable = policy.objectives.recoverable_service_data;
    const region = policy.objectives.primary_region_loss;
    const spaces = policy.objectives.spaces_and_state_regional;

    if (
      !recoverable ||
      typeof recoverable.rpo_minutes !== 'number' ||
      recoverable.rpo_minutes !== 15
    ) {
      failures.push(`${POLICY_REL}: objectives.recoverable_service_data.rpo_minutes must be 15`);
    }
    if (
      !recoverable ||
      typeof recoverable.rto_minutes !== 'number' ||
      recoverable.rto_minutes !== 240
    ) {
      failures.push(`${POLICY_REL}: objectives.recoverable_service_data.rto_minutes must be 240`);
    }
    if (!region || typeof region.rpo_minutes !== 'number' || region.rpo_minutes !== 1440) {
      failures.push(`${POLICY_REL}: objectives.primary_region_loss.rpo_minutes must be 1440`);
    }
    if (!region || typeof region.rto_minutes !== 'number' || region.rto_minutes !== 1440) {
      failures.push(`${POLICY_REL}: objectives.primary_region_loss.rto_minutes must be 1440`);
    }
    if (!spaces || spaces.best_effort !== true) {
      failures.push(
        `${POLICY_REL}: objectives.spaces_and_state_regional.best_effort must be true (TTW-060 honesty)`
      );
    }
  }

  if (!policy.retention_days || typeof policy.retention_days !== 'object') {
    failures.push(`${POLICY_REL}: retention_days object required`);
  } else {
    if (policy.retention_days.managed_postgres_pitr !== 7) {
      failures.push(`${POLICY_REL}: retention_days.managed_postgres_pitr must be 7`);
    }
    if (policy.retention_days.offsite_pg_logical_export !== 30) {
      failures.push(`${POLICY_REL}: retention_days.offsite_pg_logical_export must be 30`);
    }
  }

  if (!Array.isArray(policy.data_classes) || policy.data_classes.length < 5) {
    failures.push(`${POLICY_REL}: data_classes must list at least 5 classes`);
  } else {
    const ids = new Set(policy.data_classes.map((c) => c && c.id));
    for (const id of [
      'postgresql',
      'spaces_objects',
      'opentofu_state',
      'host_secrets_config',
      'valkey',
    ]) {
      if (!ids.has(id)) {
        failures.push(`${POLICY_REL}: data_classes missing id "${id}"`);
      }
    }
    const valkey = policy.data_classes.find((c) => c && c.id === 'valkey');
    if (valkey && valkey.reconstructable !== true) {
      failures.push(`${POLICY_REL}: valkey.data_class.reconstructable must be true`);
    }
  }

  if (
    !policy.alerts ||
    !policy.alerts.backup_stale ||
    policy.alerts.backup_stale.alert_id !== 'backup_stale'
  ) {
    failures.push(`${POLICY_REL}: alerts.backup_stale.alert_id must be "backup_stale"`);
  }

  if (
    !policy.authorization ||
    policy.authorization.destructive_restore_requires_human_confirmation !== true
  ) {
    failures.push(
      `${POLICY_REL}: authorization.destructive_restore_requires_human_confirmation must be true`
    );
  }

  const docs = read(DOCS_REL);
  if (!/\b15\s*min/i.test(docs) || !/4\s*h/i.test(docs)) {
    failures.push(`${DOCS_REL}: must document 15 min RPO / 4 h RTO for recoverable failures`);
  }
  if (!/\b24\s*h/i.test(docs)) {
    failures.push(`${DOCS_REL}: must document 24h regional RPO/RTO`);
  }
  if (!/may exceed 24h|exceed 24/i.test(docs)) {
    failures.push(
      `${DOCS_REL}: must document Spaces/state regional RPO may exceed 24h (TTW-060 honesty)`
    );
  }
  if (!/Valkey/i.test(docs) || !/reconstruct/i.test(docs)) {
    failures.push(`${DOCS_REL}: must document Valkey as reconstructable`);
  }
  if (!/human confirmation|authorization/i.test(docs)) {
    failures.push(`${DOCS_REL}: must document human authorization for destructive restore`);
  }

  const sql = read(INVARIANTS_SQL_REL);
  if (/^\s*(INSERT|UPDATE|DELETE|DROP|TRUNCATE|ALTER)\b/im.test(sql)) {
    failures.push(`${INVARIANTS_SQL_REL}: must be SELECT-only (found mutating statement)`);
  }
  for (const table of ['orders', 'payments', 'refunds', 'payouts', 'inventory_items', 'media_']) {
    if (!sql.includes(table)) {
      failures.push(`${INVARIANTS_SQL_REL}: expected coverage mentioning ${table}`);
    }
  }

  for (const rel of REQUIRED_RUNBOOKS) {
    mustExist(rel);
  }
  if (Array.isArray(policy.runbooks)) {
    for (const rel of policy.runbooks) {
      if (typeof rel === 'string') mustExist(rel);
    }
  }

  for (const rel of REQUIRED_SCRIPTS) {
    if (!mustExist(rel)) continue;
    const full = path.join(root, rel);
    try {
      fs.accessSync(full, fs.constants.X_OK);
    } catch {
      failures.push(`${rel}: must be executable`);
    }
    const body = read(rel);
    if (!body.startsWith('#!/')) {
      failures.push(`${rel}: missing shebang`);
    }
  }

  // backup_stale must exist in TTW-066 catalog
  if (mustExist(CATALOG_REL)) {
    try {
      const catalog = JSON.parse(read(CATALOG_REL));
      const ids = new Set((catalog.alerts || []).map((a) => a && a.id));
      if (!ids.has('backup_stale')) {
        failures.push(`${CATALOG_REL}: missing alert id backup_stale (TTW-066 linkage)`);
      }
    } catch (err) {
      failures.push(`${CATALOG_REL}: invalid JSON (${err.message})`);
    }
  }

  // Scan tracked backup tree for secret patterns (exclude nothing binary — all text here).
  const backupRoot = path.join(root, 'infra/runtime/backup');
  function walk(dir) {
    for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, ent.name);
      if (ent.isDirectory()) {
        walk(full);
        continue;
      }
      const text = fs.readFileSync(full, 'utf8');
      for (const pat of SECRET_PATTERNS) {
        if (pat.test(text)) {
          failures.push(`${path.relative(root, full)}: matches forbidden secret pattern ${pat}`);
        }
      }
    }
  }
  if (fs.existsSync(backupRoot)) {
    walk(backupRoot);
  }

  return failures;
}

function main(root) {
  if (!root) {
    console.error('usage: assert-backup-invariants.mjs <repo-root>');
    process.exit(2);
  }
  const failures = assertBackupInvariants(root);
  if (failures.length) {
    console.error('assert-backup-invariants: FAILED');
    for (const f of failures) console.error(`  - ${f}`);
    process.exit(1);
  }
  console.log('assert-backup-invariants: OK');
}

const invokedAsMain =
  process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;

if (invokedAsMain) {
  main(process.argv[2]);
}
