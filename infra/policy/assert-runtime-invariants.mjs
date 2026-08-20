#!/usr/bin/env node
/**
 * Credential-free runtime invariant checks for TTW-063.
 *
 * Fails if:
 * - Production Compose publishes Postgres/Valkey on all interfaces
 * - Dockerfiles lack a non-root USER
 * - Compose lacks mem_limit for budgeted roles
 * - Compose starts migrate without the migrate profile
 *
 * Usage: node assert-runtime-invariants.mjs <repo-root>
 */
import fs from 'node:fs';
import path from 'node:path';

const root = process.argv[2];
if (!root) {
  console.error('usage: assert-runtime-invariants.mjs <repo-root>');
  process.exit(2);
}

const failures = [];

function read(rel) {
  return fs.readFileSync(path.join(root, rel), 'utf8');
}

function mustExist(rel) {
  if (!fs.existsSync(path.join(root, rel))) {
    failures.push(`missing required file: ${rel}`);
    return false;
  }
  return true;
}

const requiredFiles = [
  'docker/Dockerfile.next',
  'docker/Dockerfile.api',
  'infra/runtime/compose/docker-compose.prod.yml',
  'infra/runtime/edge/Caddyfile',
  'infra/modules/droplet/main.tf',
  'docs/infrastructure/ttw-060-resource-budget.json',
];

for (const rel of requiredFiles) {
  mustExist(rel);
}

if (mustExist('docker/Dockerfile.next')) {
  const nextDf = read('docker/Dockerfile.next');
  if (!/USER\s+tamiym/.test(nextDf)) {
    failures.push('docker/Dockerfile.next must run as USER tamiym');
  }
}

if (mustExist('docker/Dockerfile.api')) {
  const apiDf = read('docker/Dockerfile.api');
  if (!/USER\s+tamiym/.test(apiDf)) {
    failures.push('docker/Dockerfile.api must run as USER tamiym');
  }
  if (!/API_ROLE/.test(apiDf)) {
    failures.push('docker/Dockerfile.api must document API_ROLE');
  }
}

if (mustExist('infra/runtime/compose/docker-compose.prod.yml')) {
  const compose = read('infra/runtime/compose/docker-compose.prod.yml');

  if (/["']0\.0\.0\.0:6379:6379["']/.test(compose) || /["']6379:6379["']/.test(compose)) {
    failures.push('Valkey must not publish 6379 on all interfaces (use 127.0.0.1:6379)');
  }
  if (/["']0\.0\.0\.0:5432:5432["']/.test(compose) || /["']5432:5432["']/.test(compose)) {
    failures.push('Compose must not publish PostgreSQL publicly');
  }

  for (const role of ['proxy', 'web', 'app', 'admin', 'api', 'worker', 'scheduler', 'valkey']) {
    const roleBlock = new RegExp(`^\\s{2}${role}:`, 'm');
    if (!roleBlock.test(compose)) {
      failures.push(`compose missing service: ${role}`);
      continue;
    }
  }

  if (!/API_ROLE:\s*api/.test(compose) || !/API_ROLE:\s*worker/.test(compose) || !/API_ROLE:\s*scheduler/.test(compose)) {
    failures.push('compose must set API_ROLE for api, worker, and scheduler');
  }

  if (!/profiles:\s*\[\s*"migrate"\s*\]/.test(compose)) {
    failures.push('migrate service must be gated behind profiles: ["migrate"]');
  }

  const budget = JSON.parse(read('docs/infrastructure/ttw-060-resource-budget.json'));
  for (const c of budget.containers) {
    const hard = c.hardMiB;
    // Compose uses e.g. mem_limit: 512m near the service; require the hard cap appears.
    if (!new RegExp(`mem_limit:\\s*${hard}m`).test(compose)) {
      failures.push(`compose missing mem_limit: ${hard}m for budgeted role ${c.role}`);
    }
  }
}

if (mustExist('infra/runtime/edge/Caddyfile')) {
  const caddy = read('infra/runtime/edge/Caddyfile');
  for (const backend of ['web:3000', 'app:3002', 'admin:3003', 'api:3001']) {
    if (!caddy.includes(`reverse_proxy ${backend}`)) {
      failures.push(`Caddyfile missing reverse_proxy ${backend}`);
    }
  }
}

if (failures.length) {
  console.error('assert-runtime-invariants FAILED:');
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}

console.log('assert-runtime-invariants OK');
