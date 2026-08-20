#!/usr/bin/env node
/**
 * Credential-free data-service invariant checks for TTW-064.
 *
 * Fails if:
 * - digitalocean_database_firewall rules allow 0.0.0.0/0 or ::/0
 * - originals/quarantine Spaces buckets use acl public-read
 * - production postgres module call does not set deletion_protection = true
 * - tmpval postgres module call does not set deletion_protection = false
 * - valkey.conf missing maxmemory 256mb / maxmemory-policy noeviction / env requirepass contract
 *
 * Usage: node assert-data-invariants.mjs <repo-root>
 */
import fs from 'node:fs';
import path from 'node:path';

const PUBLIC_CIDRS = new Set(['0.0.0.0/0', '::/0']);
const root = process.argv[2];
if (!root) {
  console.error('usage: assert-data-invariants.mjs <repo-root>');
  process.exit(2);
}

const infraRoot = path.join(root, 'infra');
const failures = [];

function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === '.terraform' || entry.name === 'node_modules') continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (entry.isFile() && entry.name.endsWith('.tf')) out.push(full);
  }
  return out;
}

function stripComments(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])#[^\n]*/g, '$1')
    .replace(/\/\/[^\n]*/g, '');
}

function extractModuleBlocks(src, moduleName) {
  const blocks = [];
  const startRe = new RegExp(`module\\s+"${moduleName}"\\s*\\{`, 'g');
  let m;
  while ((m = startRe.exec(src)) !== null) {
    let depth = 0;
    let i = m.index + m[0].length - 1;
    const start = i + 1;
    for (; i < src.length; i++) {
      if (src[i] === '{') depth++;
      else if (src[i] === '}') {
        depth--;
        if (depth === 0) {
          blocks.push(src.slice(start, i));
          break;
        }
      }
    }
  }
  return blocks;
}

function extractBoolAssign(block, key) {
  const re = new RegExp(`${key}\\s*=\\s*(true|false)`, 'm');
  const m = block.match(re);
  return m ? m[1] === 'true' : null;
}

function checkDatabaseFirewallPublic(file, src) {
  if (!src.includes('digitalocean_database_firewall') && !src.includes('firewall_rules')) {
    return;
  }
  const rel = path.relative(root, file);

  // rule { type = "ip_addr" value = "0.0.0.0/0" }
  const ruleRe = /rule\s*\{([^{}]*)\}/g;
  let match;
  let i = 0;
  while ((match = ruleRe.exec(src)) !== null) {
    const body = match[1];
    const values = [...body.matchAll(/value\s*=\s*"([^"]+)"/g)].map((x) => x[1]);
    for (const v of values) {
      if (PUBLIC_CIDRS.has(v)) {
        failures.push(
          `${rel} database firewall rule#${i + 1}: must not allow public CIDR ${v}`
        );
      }
    }
    i++;
  }

  // firewall_rules = [ { type = "ip_addr", value = "0.0.0.0/0" }, ... ]
  if (/0\.0\.0\.0\/0|::\/0/.test(src) && /firewall_rules|digitalocean_database_firewall/.test(src)) {
    // Already covered for rule blocks; also catch list literals near firewall_rules.
    const fwAssign = src.match(/firewall_rules\s*=\s*\[[\s\S]*?\]/);
    if (fwAssign && /0\.0\.0\.0\/0|::\/0/.test(fwAssign[0])) {
      failures.push(`${rel}: firewall_rules must not include 0.0.0.0/0 or ::/0`);
    }
  }
}

function checkSpacesPrivateAcls(file, src) {
  if (!src.includes('digitalocean_spaces_bucket')) return;
  const rel = path.relative(root, file);

  // Match resource "digitalocean_spaces_bucket" "originals|quarantine" { ... }
  const bucketRe =
    /resource\s+"digitalocean_spaces_bucket"\s+"(originals|quarantine)"\s*\{([\s\S]*?)\n\}/g;
  let m;
  while ((m = bucketRe.exec(src)) !== null) {
    const name = m[1];
    const body = m[2];
    const acl = body.match(/acl\s*=\s*"([^"]+)"/);
    if (!acl) {
      failures.push(`${rel}: spaces bucket "${name}" must set acl explicitly`);
      continue;
    }
    if (acl[1] === 'public-read') {
      failures.push(
        `${rel}: spaces bucket "${name}" must not use acl public-read (got ${acl[1]})`
      );
    }
    if (acl[1] !== 'private') {
      failures.push(
        `${rel}: spaces bucket "${name}" must use acl "private" (got ${acl[1]})`
      );
    }
  }
}

function checkEnvDeletionProtection() {
  const prodMain = path.join(infraRoot, 'envs', 'production', 'main.tf');
  const tmpMain = path.join(infraRoot, 'envs', 'temporary-validation', 'main.tf');

  for (const [file, expected] of [
    [prodMain, true],
    [tmpMain, false],
  ]) {
    if (!fs.existsSync(file)) {
      failures.push(`missing ${path.relative(root, file)}`);
      continue;
    }
    const src = stripComments(fs.readFileSync(file, 'utf8'));
    const blocks = extractModuleBlocks(src, 'postgres');
    if (blocks.length === 0) {
      failures.push(`${path.relative(root, file)}: missing module "postgres"`);
      continue;
    }
    const flag = extractBoolAssign(blocks[0], 'deletion_protection');
    if (flag === null) {
      failures.push(
        `${path.relative(root, file)}: module "postgres" must set deletion_protection`
      );
    } else if (flag !== expected) {
      failures.push(
        `${path.relative(root, file)}: module "postgres" deletion_protection must be ${expected}`
      );
    }
  }
}

function checkPostgresModuleContract() {
  const main = path.join(infraRoot, 'modules', 'postgres', 'main.tf');
  if (!fs.existsSync(main)) {
    failures.push('missing infra/modules/postgres/main.tf');
    return;
  }
  const body = fs.readFileSync(main, 'utf8');
  for (const needle of [
    'engine               = "pg"',
    'private_network_uuid',
    'digitalocean_database_firewall',
    'prevent_destroy = true',
  ]) {
    if (!body.includes(needle)) {
      failures.push(`postgres module missing expected fragment: ${needle}`);
    }
  }

  const vars = path.join(infraRoot, 'modules', 'postgres', 'variables.tf');
  const varBody = fs.readFileSync(vars, 'utf8');
  if (!varBody.includes('variable "deletion_protection"')) {
    failures.push('postgres module must declare variable "deletion_protection"');
  }
  if (!varBody.includes('0.0.0.0/0')) {
    failures.push('postgres module must validate firewall_rules against public CIDRs');
  }
}

function checkValkeyConf() {
  const conf = path.join(infraRoot, 'runtime', 'valkey', 'valkey.conf');
  if (!fs.existsSync(conf)) {
    failures.push('missing infra/runtime/valkey/valkey.conf');
    return;
  }
  const body = fs.readFileSync(conf, 'utf8');
  if (!/^\s*maxmemory\s+256mb\s*$/m.test(body)) {
    failures.push('valkey.conf must set maxmemory 256mb');
  }
  if (!/^\s*maxmemory-policy\s+noeviction\s*$/m.test(body)) {
    failures.push('valkey.conf must set maxmemory-policy noeviction');
  }
  if (!/VALKEY_PASSWORD|REQUIREPASS_FROM_ENV/.test(body)) {
    failures.push('valkey.conf must document requirepass from VALKEY_PASSWORD env');
  }

  const snippet = path.join(infraRoot, 'runtime', 'valkey', 'compose.snippet.yml');
  if (!fs.existsSync(snippet)) {
    failures.push('missing infra/runtime/valkey/compose.snippet.yml');
  } else {
    const yml = fs.readFileSync(snippet, 'utf8');
    if (!yml.includes('requirepass') || !yml.includes('VALKEY_PASSWORD')) {
      failures.push('compose.snippet.yml must wire requirepass from VALKEY_PASSWORD');
    }
    if (!yml.includes('127.0.0.1:6379')) {
      failures.push('compose.snippet.yml must bind Valkey to loopback only');
    }
  }

  const mod = path.join(infraRoot, 'modules', 'valkey_config', 'main.tf');
  if (!fs.existsSync(mod)) {
    failures.push('missing infra/modules/valkey_config/main.tf');
  } else {
    const modBody = fs.readFileSync(mod, 'utf8');
    if (!modBody.includes('noeviction') || !modBody.includes('256mb')) {
      failures.push('valkey_config module must encode 256mb / noeviction contract');
    }
  }
}

for (const file of walk(infraRoot)) {
  const src = stripComments(fs.readFileSync(file, 'utf8'));
  checkDatabaseFirewallPublic(file, src);
  checkSpacesPrivateAcls(file, src);
}

checkEnvDeletionProtection();
checkPostgresModuleContract();
checkValkeyConf();

if (failures.length) {
  console.error('assert-data-invariants: FAILED');
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}

console.log('assert-data-invariants: OK');
