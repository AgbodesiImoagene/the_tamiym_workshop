#!/usr/bin/env node
/**
 * Compares Jest coverage-summary.json against a committed ratchet baseline.
 * Fails if any global metric regresses below the baseline floor.
 *
 * Usage:
 *   node scripts/quality/check-coverage-ratchet.mjs \
 *     [--summary apps/api/coverage/coverage-summary.json] \
 *     [--baseline apps/api/coverage-ratchet.json]
 */
import fs from 'node:fs';
import path from 'node:path';

function parseArgs(argv) {
  const args = {
    summary: 'apps/api/coverage/coverage-summary.json',
    baseline: 'apps/api/coverage-ratchet.json',
  };
  for (let i = 2; i < argv.length; i += 1) {
    const key = argv[i];
    const value = argv[i + 1];
    if (key === '--summary' && value) {
      args.summary = value;
      i += 1;
    } else if (key === '--baseline' && value) {
      args.baseline = value;
      i += 1;
    }
  }
  return args;
}

function readJson(filePath) {
  if (!fs.existsSync(filePath)) {
    console.error(`Missing required report: ${filePath}`);
    process.exit(1);
  }
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function pct(metric) {
  if (!metric || typeof metric.pct !== 'number') {
    throw new Error(`Coverage metric missing pct: ${JSON.stringify(metric)}`);
  }
  return metric.pct;
}

const args = parseArgs(process.argv);
const root = process.cwd();
const summaryPath = path.resolve(root, args.summary);
const baselinePath = path.resolve(root, args.baseline);

const summary = readJson(summaryPath);
const baseline = readJson(baselinePath);
const total = summary.total;
if (!total) {
  console.error('coverage-summary.json missing total section');
  process.exit(1);
}

const metrics = ['statements', 'branches', 'functions', 'lines'];
const floors = baseline.floors ?? baseline;
let failed = false;

console.log('Coverage ratchet comparison');
console.log(`summary:  ${summaryPath}`);
console.log(`baseline: ${baselinePath}`);

for (const metric of metrics) {
  const actual = pct(total[metric]);
  const floor = Number(floors[metric]);
  if (Number.isNaN(floor)) {
    console.error(`Baseline missing numeric floor for ${metric}`);
    process.exit(1);
  }
  const ok = actual + 1e-9 >= floor;
  console.log(
    `  ${metric.padEnd(11)} actual=${actual.toFixed(2)}% floor=${floor.toFixed(2)}% ${ok ? 'OK' : 'REGRESSION'}`
  );
  if (!ok) failed = true;
}

if (failed) {
  console.error('Coverage ratchet failed: aggregate coverage regressed below committed floors.');
  process.exit(1);
}

console.log('Coverage ratchet passed.');
