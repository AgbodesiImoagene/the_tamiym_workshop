#!/usr/bin/env node
/**
 * Enforces diff coverage for changed executable lines under apps/api/src
 * relative to a git base ref (default origin/main).
 *
 * Requires:
 *   - apps/api/coverage/coverage-final.json (Istanbul)
 *   - git history for the base ref
 *
 * Usage:
 *   node scripts/quality/check-diff-coverage.mjs \
 *     [--base origin/main] \
 *     [--floor 80] \
 *     [--coverage apps/api/coverage/coverage-final.json] \
 *     [--root apps/api/src]
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

function parseArgs(argv) {
  const args = {
    base: process.env.COVERAGE_DIFF_BASE || 'origin/main',
    floor: Number(process.env.COVERAGE_DIFF_FLOOR || 80),
    coverage: 'apps/api/coverage/coverage-final.json',
    root: 'apps/api/src',
    /** @type {string | null} relativePath:line,line — bypasses git for negative proofs */
    forceLines: null,
  };
  for (let i = 2; i < argv.length; i += 1) {
    const key = argv[i];
    const value = argv[i + 1];
    if (key === '--base' && value) {
      args.base = value;
      i += 1;
    } else if (key === '--floor' && value) {
      args.floor = Number(value);
      i += 1;
    } else if (key === '--coverage' && value) {
      args.coverage = value;
      i += 1;
    } else if (key === '--root' && value) {
      args.root = value;
      i += 1;
    } else if (key === '--force-lines' && value) {
      args.forceLines = value;
      i += 1;
    }
  }
  return args;
}

function git(args) {
  return execFileSync('git', args, { encoding: 'utf8' });
}

function listChangedFiles(base, rootPrefix) {
  let mergeBase;
  try {
    git(['rev-parse', '--verify', base]);
    mergeBase = git(['merge-base', base, 'HEAD']).trim();
  } catch {
    console.error(`Base ref not available: ${base}. Fetch it before running diff coverage.`);
    process.exit(1);
  }

  // Include committed and uncommitted changes relative to the merge base so
  // local verify matches what a PR will contain once pushed.
  const output = git(['diff', '--name-only', '--diff-filter=ACMR', mergeBase]);
  return output
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((file) => file.startsWith(`${rootPrefix}/`))
    .filter((file) => /\.(ts|js)$/.test(file))
    .filter((file) => !file.endsWith('.spec.ts'))
    .filter((file) => !file.includes('/generated/'))
    .filter((file) => !file.includes('/dto/'));
}

function changedLinesByFile(base, files) {
  let mergeBase;
  try {
    mergeBase = git(['merge-base', base, 'HEAD']).trim();
  } catch {
    console.error(`Unable to resolve merge-base with ${base}`);
    process.exit(1);
  }
  const map = new Map();
  for (const file of files) {
    const patch = git(['diff', '-U0', mergeBase, '--', file]);
    const lines = new Set();
    for (const line of patch.split('\n')) {
      const match = /^@@ -\d+(?:,\d+)? \+(\d+)(?:,(\d+))? @@/.exec(line);
      if (!match) continue;
      const start = Number(match[1]);
      const count = match[2] === undefined ? 1 : Number(match[2]);
      if (count === 0) continue;
      for (let i = 0; i < count; i += 1) lines.add(start + i);
    }
    if (lines.size > 0) map.set(path.resolve(file), lines);
  }
  return map;
}

function coverageHitsForFile(coverage, absFile) {
  const entry =
    coverage[absFile] ||
    coverage[absFile.replace(/\\/g, '/')] ||
    Object.entries(coverage).find(([key]) => path.resolve(key) === absFile)?.[1];
  if (!entry?.statementMap || !entry?.s) return null;

  const hitByLine = new Map();
  for (const [key, loc] of Object.entries(entry.statementMap)) {
    const line = loc.start.line;
    const hits = entry.s[key] ?? 0;
    hitByLine.set(line, Math.max(hitByLine.get(line) ?? 0, hits));
  }
  return hitByLine;
}

const args = parseArgs(process.argv);
const root = process.cwd();
const coveragePath = path.resolve(root, args.coverage);

if (!fs.existsSync(coveragePath)) {
  console.error(`Missing coverage report: ${coveragePath}`);
  process.exit(1);
}

const coverage = JSON.parse(fs.readFileSync(coveragePath, 'utf8'));

/** @type {string[]} */
let changedFiles;
/** @type {Map<string, Set<number>>} */
let changedLines;

if (args.forceLines) {
  const colon = args.forceLines.indexOf(':');
  const relFile = colon === -1 ? '' : args.forceLines.slice(0, colon);
  const lineCsv = colon === -1 ? '' : args.forceLines.slice(colon + 1);
  if (!relFile || !lineCsv) {
    console.error('Invalid --force-lines; expected relative/path.ts:line[,line]');
    process.exit(1);
  }
  const abs = path.resolve(root, relFile);
  const lines = new Set(
    lineCsv
      .split(',')
      .map((n) => Number(n.trim()))
      .filter((n) => Number.isFinite(n) && n > 0)
  );
  if (lines.size === 0) {
    console.error('Invalid --force-lines; no positive line numbers provided');
    process.exit(1);
  }
  changedFiles = [relFile];
  changedLines = new Map([[abs, lines]]);
} else {
  changedFiles = listChangedFiles(args.base, args.root);

  if (changedFiles.length === 0) {
    console.log(
      `No changed executable files under ${args.root} vs ${args.base}; diff coverage skipped.`
    );
    process.exit(0);
  }

  changedLines = changedLinesByFile(args.base, changedFiles);
}

let covered = 0;
let total = 0;
const uncovered = [];

for (const [absFile, lines] of changedLines.entries()) {
  const hits = coverageHitsForFile(coverage, absFile);
  // Files missing from Istanbul are treated as fully uncovered (fail-closed).
  if (!hits) {
    for (const line of lines) {
      total += 1;
      uncovered.push(`${path.relative(root, absFile)}:${line}`);
    }
    continue;
  }
  for (const line of lines) {
    // Skip blank/comment/type-only lines that Istanbul does not instrument.
    if (!hits.has(line)) continue;
    total += 1;
    const lineHits = hits.get(line) ?? 0;
    if (lineHits > 0) {
      covered += 1;
    } else {
      uncovered.push(`${path.relative(root, absFile)}:${line}`);
    }
  }
}

if (total === 0) {
  console.log('Changed files had no added executable lines; diff coverage skipped.');
  process.exit(0);
}

const pct = (covered / total) * 100;
console.log('Diff coverage');
console.log(`  base:    ${args.base}`);
console.log(`  files:   ${changedFiles.length}`);
console.log(`  lines:   ${covered}/${total} covered (${pct.toFixed(2)}%)`);
console.log(`  floor:   ${args.floor}%`);

if (pct + 1e-9 < args.floor) {
  console.error('Diff coverage failed.');
  for (const loc of uncovered.slice(0, 50)) console.error(`  uncovered ${loc}`);
  if (uncovered.length > 50) console.error(`  ... ${uncovered.length - 50} more`);
  process.exit(1);
}

console.log('Diff coverage passed.');
