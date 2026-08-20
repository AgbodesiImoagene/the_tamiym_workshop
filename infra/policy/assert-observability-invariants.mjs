#!/usr/bin/env node
/**
 * Credential-free observability / cost invariant checks for TTW-066.
 *
 * Fails if:
 * - Alert catalog entries lack required fields
 * - Any alert runbook file is missing
 * - OTel collector config contains plaintext secrets / DIGITALOCEAN_TOKEN values
 * - Redaction processor paths are absent from the collector config
 * - Cost warning threshold (> USD 50) is missing from catalog
 *
 * Usage: node assert-observability-invariants.mjs <repo-root>
 */
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const REQUIRED_ALERT_FIELDS = ['id', 'severity', 'signal', 'runbook_relpath', 'owner_role'];
const ALLOWED_SEVERITIES = new Set(['page', 'ticket', 'info']);
const COST_WARNING_MAX_USD = 50;

const CATALOG_REL = 'infra/runtime/observability/alerts/catalog.json';
const COLLECTOR_REL = 'infra/runtime/observability/otel-collector.prod.yaml';
const DOCS_REL = 'docs/infrastructure/ttw-066-observability-cost.md';

/**
 * @param {string} root
 * @returns {string[]} failure messages
 */
export function assertObservabilityInvariants(root) {
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

  if (!mustExist(CATALOG_REL) || !mustExist(COLLECTOR_REL) || !mustExist(DOCS_REL)) {
    return failures;
  }

  let catalog;
  try {
    catalog = JSON.parse(read(CATALOG_REL));
  } catch (err) {
    failures.push(`${CATALOG_REL}: invalid JSON (${err.message})`);
    return failures;
  }

  if (!Array.isArray(catalog.alerts) || catalog.alerts.length === 0) {
    failures.push(`${CATALOG_REL}: alerts[] must be a non-empty array`);
    return failures;
  }

  const warning =
    catalog.cost && typeof catalog.cost.warning_usd_lte === 'number'
      ? catalog.cost.warning_usd_lte
      : null;
  if (warning === null) {
    failures.push(`${CATALOG_REL}: cost.warning_usd_lte must be a number`);
  } else if (warning > COST_WARNING_MAX_USD) {
    failures.push(
      `${CATALOG_REL}: cost.warning_usd_lte=${warning} exceeds allowed max ${COST_WARNING_MAX_USD}`
    );
  } else if (warning <= 0) {
    failures.push(`${CATALOG_REL}: cost.warning_usd_lte must be positive`);
  }

  const docs = read(DOCS_REL);
  if (!/USD\s*50|\$\s*50|50/.test(docs) || !/warning/i.test(docs)) {
    failures.push(`${DOCS_REL}: must document cost warning at USD 50`);
  }

  const seenIds = new Set();
  for (const [i, alert] of catalog.alerts.entries()) {
    const label = `${CATALOG_REL}: alerts[${i}]`;
    if (!alert || typeof alert !== 'object') {
      failures.push(`${label}: must be an object`);
      continue;
    }
    for (const field of REQUIRED_ALERT_FIELDS) {
      if (typeof alert[field] !== 'string' || !alert[field].trim()) {
        failures.push(`${label}: missing required string field "${field}"`);
      }
    }
    if (alert.id) {
      if (seenIds.has(alert.id)) {
        failures.push(`${label}: duplicate id "${alert.id}"`);
      }
      seenIds.add(alert.id);
    }
    if (alert.severity && !ALLOWED_SEVERITIES.has(alert.severity)) {
      failures.push(
        `${label}: severity "${alert.severity}" not in ${[...ALLOWED_SEVERITIES].join('|')}`
      );
    }
    if (typeof alert.owner_role === 'string' && !/PLACEHOLDER|OWNER_/i.test(alert.owner_role)) {
      // Allow role placeholders; reject anything that looks like an email/phone contact.
      if (/@|\+\d{6,}/.test(alert.owner_role)) {
        failures.push(`${label}: owner_role must not embed contact details (use placeholders)`);
      }
    }
    if (typeof alert.runbook_relpath === 'string' && alert.runbook_relpath.trim()) {
      const rb = alert.runbook_relpath.replace(/^\.\//, '');
      if (!mustExist(rb)) {
        // mustExist already recorded
      } else if (!rb.startsWith('infra/runtime/observability/runbooks/')) {
        failures.push(
          `${label}: runbook_relpath should live under infra/runtime/observability/runbooks/`
        );
      }
    }
  }

  const collector = read(COLLECTOR_REL);

  // No plaintext provider tokens or assignment of live DIGITALOCEAN_TOKEN.
  if (/dop_v1_[A-Za-z0-9_]{20,}/.test(collector)) {
    failures.push(`${COLLECTOR_REL}: contains DigitalOcean token pattern dop_v1_…`);
  }
  if (
    /DIGITALOCEAN_TOKEN\s*[:=]\s*["']?(?!\$\{env:)(?!PLACEHOLDER)[A-Za-z0-9_+/=-]{8,}/.test(
      collector
    )
  ) {
    failures.push(`${COLLECTOR_REL}: must not hardcode DIGITALOCEAN_TOKEN`);
  }
  // Reject obvious hardcoded secrets (non-env placeholders).
  if (/api[_-]?key\s*[:=]\s*["'][A-Za-z0-9]{12,}["']/i.test(collector)) {
    failures.push(`${COLLECTOR_REL}: looks like a hardcoded api key`);
  }
  if (/Authorization:\s*["']Bearer\s+[A-Za-z0-9._\-]{8,}["']/i.test(collector)) {
    failures.push(`${COLLECTOR_REL}: hardcoded Bearer token (use env substitution)`);
  }

  // Redaction processor paths must be present.
  if (!/attributes\/redaction/.test(collector)) {
    failures.push(`${COLLECTOR_REL}: missing attributes/redaction processor`);
  }
  if (!/action:\s*delete/.test(collector)) {
    failures.push(`${COLLECTOR_REL}: redaction processor must delete sensitive keys`);
  }
  for (const key of ['password', 'authorization', 'DIGITALOCEAN_TOKEN', 'database_url']) {
    if (!new RegExp(`key:\\s*${key}\\b`).test(collector)) {
      failures.push(`${COLLECTOR_REL}: redaction must include key ${key}`);
    }
  }

  // Destination must be env-configured, not a hardcoded vendor URL with credentials.
  if (!/\$\{env:OTEL_EXPORTER_OTLP_ENDPOINT\}/.test(collector)) {
    failures.push(
      `${COLLECTOR_REL}: exporter endpoint must use \${env:OTEL_EXPORTER_OTLP_ENDPOINT}`
    );
  }

  return failures;
}

function main(root) {
  if (!root) {
    console.error('usage: assert-observability-invariants.mjs <repo-root>');
    process.exit(2);
  }
  const failures = assertObservabilityInvariants(root);
  if (failures.length) {
    console.error('assert-observability-invariants: FAILED');
    for (const f of failures) console.error(`  - ${f}`);
    process.exit(1);
  }
  console.log('assert-observability-invariants: OK');
}

const invokedAsMain =
  process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;

if (invokedAsMain) {
  main(process.argv[2]);
}
