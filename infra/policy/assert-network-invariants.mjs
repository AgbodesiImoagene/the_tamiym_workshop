#!/usr/bin/env node
/**
 * Credential-free network invariant checks for TTW-062.
 *
 * Scans OpenTofu HCL under infra/ for digitalocean_firewall inbound_rule blocks
 * and fails if:
 * - inbound exposes forbidden data/management ports (5432, 6379, 27017, 2375, 9000)
 * - inbound TCP/22 (or a range covering 22) is open to 0.0.0.0/0 or ::/0
 *
 * Usage: node assert-network-invariants.mjs <repo-root>
 */
import fs from 'node:fs';
import path from 'node:path';

const FORBIDDEN_PORTS = new Set([5432, 6379, 27017, 2375, 9000]);
const PUBLIC_CIDRS = new Set(['0.0.0.0/0', '::/0']);

const root = process.argv[2];
if (!root) {
  console.error('usage: assert-network-invariants.mjs <repo-root>');
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

function parsePortRange(range) {
  const trimmed = range.trim().replace(/^"|"$/g, '');
  if (trimmed === 'all' || trimmed === '1-65535') {
    return { low: 1, high: 65535 };
  }
  if (/^\d+$/.test(trimmed)) {
    const n = Number(trimmed);
    return { low: n, high: n };
  }
  const m = trimmed.match(/^(\d+)-(\d+)$/);
  if (!m) return null;
  return { low: Number(m[1]), high: Number(m[2]) };
}

function rangeIncludes(range, port) {
  return range && port >= range.low && port <= range.high;
}

function extractList(block, key) {
  const re = new RegExp(`${key}\\s*=\\s*\\[([^\\]]*)\\]`, 'm');
  const m = block.match(re);
  if (!m) return [];
  return [...m[1].matchAll(/"([^"]+)"/g)].map((x) => x[1]);
}

function extractString(block, key) {
  const re = new RegExp(`${key}\\s*=\\s*"([^"]*)"`, 'm');
  const m = block.match(re);
  return m ? m[1] : null;
}

function checkInboundBlock(file, block, index) {
  const protocol = extractString(block, 'protocol') || '';
  const portRaw = extractString(block, 'port_range');
  const sources = extractList(block, 'source_addresses');
  const label = `${path.relative(root, file)} inbound_rule#${index + 1}`;

  if (protocol === 'icmp') {
    return;
  }

  const range = portRaw ? parsePortRange(portRaw) : null;
  if (portRaw && !range) {
    failures.push(`${label}: unparseable port_range "${portRaw}"`);
    return;
  }

  if (range) {
    for (const port of FORBIDDEN_PORTS) {
      if (rangeIncludes(range, port)) {
        failures.push(
          `${label}: inbound must not expose forbidden port ${port} (port_range=${portRaw})`
        );
      }
    }
  }

  const opensSsh = range && rangeIncludes(range, 22);
  const publicSource = sources.some((s) => PUBLIC_CIDRS.has(s));
  if (opensSsh && publicSource) {
    failures.push(
      `${label}: SSH (port 22) must not be open to ${sources.filter((s) => PUBLIC_CIDRS.has(s)).join(', ')}`
    );
  }
}

function checkFile(file) {
  const raw = fs.readFileSync(file, 'utf8');
  if (!raw.includes('digitalocean_firewall') && !raw.includes('inbound_rule')) {
    return;
  }
  const src = stripComments(raw);

  // Only inspect inbound_rule blocks (not outbound_rule).
  const inboundRe = /inbound_rule\s*\{([^{}]*(?:\{[^{}]*\}[^{}]*)*)\}/g;
  let match;
  let i = 0;
  while ((match = inboundRe.exec(src)) !== null) {
    checkInboundBlock(file, match[1], i++);
  }
}

for (const file of walk(infraRoot)) {
  checkFile(file);
}

// Require the firewall module to exist and declare the expected public surface.
const firewallMain = path.join(infraRoot, 'modules', 'firewall', 'main.tf');
if (!fs.existsSync(firewallMain)) {
  failures.push('missing infra/modules/firewall/main.tf');
} else {
  const body = fs.readFileSync(firewallMain, 'utf8');
  for (const needle of [
    'port_range       = "22"',
    'port_range       = "80"',
    'port_range       = "443"',
    'ssh_source_cidrs',
  ]) {
    if (!body.includes(needle)) {
      failures.push(`firewall module missing expected fragment: ${needle}`);
    }
  }
  for (const port of ['5432', '6379', '27017', '2375', '9000']) {
    const inboundOnly = [...body.matchAll(/inbound_rule\s*\{([^{}]*(?:\{[^{}]*\}[^{}]*)*)\}/g)].map(
      (m) => m[1]
    );
    if (inboundOnly.some((block) => new RegExp(`port_range\\s*=\\s*"${port}"`).test(block))) {
      failures.push(`firewall module inbound declares forbidden port ${port}`);
    }
  }
}

if (failures.length) {
  console.error('assert-network-invariants: FAILED');
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}

console.log('assert-network-invariants: OK');
