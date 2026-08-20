#!/usr/bin/env node
/**
 * Credential-free security invariant checks for TTW-065.
 *
 * Fails if:
 * - Any OpenTofu/Terraform `output "…"` name suggests a secret export
 *   (password, secret, token, or connection URI/URL that typically embeds a password)
 * - Tracked files under infra/ or docs/ contain a DIGITALOCEAN_TOKEN assignment
 *   with a non-placeholder value, or a dop_v1_ token pattern
 *
 * Usage: node assert-security-invariants.mjs <repo-root>
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const root = process.argv[2];
if (!root) {
  console.error('usage: assert-security-invariants.mjs <repo-root>');
  process.exit(2);
}

const failures = [];

/** Output names that must never exist (secrets belong in host files / vaults). */
const FORBIDDEN_OUTPUT_NAME =
  /(password|secret|token|(^|_)uri$|database_url|connection_url|connection_string|connection_uri)/i;

const PLACEHOLDER_ASSIGN =
  /^(?:|\.\.\.|…|CHANGE_ME|PLACEHOLDER(?:_[A-Z0-9]+)?|never commit|<[^>]+>|your-[a-z0-9-]+)$/i;

function listTrackedUnder(...prefixes) {
  let out = '';
  try {
    out = execFileSync('git', ['-C', root, 'ls-files', '-z', '--', ...prefixes], {
      encoding: 'utf8',
      maxBuffer: 32 * 1024 * 1024,
    });
  } catch {
    // Fallback when git is unavailable: walk the trees.
    return walkFallback(prefixes);
  }
  return out
    .split('\0')
    .filter(Boolean)
    .map((rel) => path.join(root, rel));
}

function walkFallback(prefixes) {
  const files = [];
  function walk(dir) {
    if (!fs.existsSync(dir)) return;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.name === '.terraform' || entry.name === 'node_modules' || entry.name === '.git') {
        continue;
      }
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.isFile()) files.push(full);
    }
  }
  for (const p of prefixes) walk(path.join(root, p));
  return files;
}

function walkTf(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === '.terraform' || entry.name === 'node_modules') continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walkTf(full, out);
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

function checkForbiddenOutputs() {
  const infraRoot = path.join(root, 'infra');
  for (const file of walkTf(infraRoot)) {
    const rel = path.relative(root, file);
    const src = stripComments(fs.readFileSync(file, 'utf8'));
    const re = /output\s+"([^"]+)"\s*\{/g;
    let m;
    while ((m = re.exec(src)) !== null) {
      const name = m[1];
      if (FORBIDDEN_OUTPUT_NAME.test(name)) {
        failures.push(
          `${rel}: output "${name}" name suggests a secret export (password/secret/token/uri); keep values out of OpenTofu outputs`
        );
      }
    }
  }
}

function isPlaceholderValue(raw) {
  const v = raw.trim().replace(/^["']|["']$/g, '');
  if (!v) return true;
  if (PLACEHOLDER_ASSIGN.test(v)) return true;
  if (/^PLACEHOLDER_/i.test(v)) return true;
  if (/change.?me/i.test(v)) return true;
  return false;
}

function checkDigitalOceanTokenInTracked() {
  const files = listTrackedUnder('infra', 'docs');
  const assignRe = /DIGITALOCEAN_TOKEN\s*=\s*([^\s#]+)/g;
  const dopRe = /dop_v1_[A-Za-z0-9_]{20,}/g;

  for (const file of files) {
    // Skip binary-ish / generated
    if (file.includes(`${path.sep}.terraform${path.sep}`)) continue;
    if (/\.(tfstate|tfplan)(\.|$)/.test(file)) continue;

    let body;
    try {
      body = fs.readFileSync(file, 'utf8');
    } catch {
      continue;
    }

    const rel = path.relative(root, file);

    // Real token material
    if (dopRe.test(body)) {
      failures.push(`${rel}: contains DigitalOcean token pattern dop_v1_…`);
    }
    dopRe.lastIndex = 0;

    // Assignments with non-placeholder values (docs may name the env var; must not set a live value)
    let m;
    while ((m = assignRe.exec(body)) !== null) {
      const value = m[1];
      if (!isPlaceholderValue(value)) {
        // Allow ellipsis unicode already handled; also allow single-char stubs in runbooks
        if (/^[A-Za-z0-9_+/=-]{8,}$/.test(value.replace(/^["']|["']$/g, ''))) {
          failures.push(
            `${rel}: DIGITALOCEAN_TOKEN assignment looks like a real value (use owner vault / GitHub Environment only)`
          );
        }
      }
    }
  }
}

checkForbiddenOutputs();
checkDigitalOceanTokenInTracked();

if (failures.length) {
  console.error('assert-security-invariants: FAILED');
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}

console.log('assert-security-invariants: OK');
