#!/usr/bin/env node
/**
 * Negative proofs for quality-gate fail-closed behaviour.
 * Intended for local/CI smoke of the gate machinery itself.
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    encoding: 'utf8',
    cwd: options.cwd || process.cwd(),
    env: { ...process.env, ...(options.env || {}) },
  });
  return result;
}

function assertFail(label, result) {
  if (result.status === 0) {
    console.error(`FAIL: expected non-zero exit for ${label}`);
    process.exit(1);
  }
  console.log(`OK: ${label} failed closed (exit ${result.status})`);
}

function assertPass(label, result) {
  if (result.status !== 0) {
    console.error(`FAIL: expected zero exit for ${label}`);
    console.error(result.stdout);
    console.error(result.stderr);
    process.exit(1);
  }
  console.log(`OK: ${label} passed`);
}

const root = process.cwd();
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ttw-quality-'));

// Missing coverage summary must fail closed.
{
  const missingSummary = path.join(tmp, 'missing-summary.json');
  const baseline = path.join(tmp, 'baseline.json');
  fs.writeFileSync(
    baseline,
    JSON.stringify({ floors: { statements: 1, branches: 1, functions: 1, lines: 1 } })
  );
  const result = run('node', [
    'scripts/quality/check-coverage-ratchet.mjs',
    '--summary',
    missingSummary,
    '--baseline',
    baseline,
  ]);
  assertFail('missing coverage summary', result);
}

// Aggregate regression must fail.
{
  const summary = path.join(tmp, 'summary.json');
  const baseline = path.join(tmp, 'baseline-high.json');
  fs.writeFileSync(
    summary,
    JSON.stringify({
      total: {
        statements: { pct: 10 },
        branches: { pct: 10 },
        functions: { pct: 10 },
        lines: { pct: 10 },
      },
    })
  );
  fs.writeFileSync(
    baseline,
    JSON.stringify({ floors: { statements: 90, branches: 90, functions: 90, lines: 90 } })
  );
  const result = run('node', [
    'scripts/quality/check-coverage-ratchet.mjs',
    '--summary',
    summary,
    '--baseline',
    baseline,
  ]);
  assertFail('coverage ratchet regression', result);
}

// Healthy floors must pass.
{
  const summary = path.join(tmp, 'summary-ok.json');
  const baseline = path.join(tmp, 'baseline-ok.json');
  fs.writeFileSync(
    summary,
    JSON.stringify({
      total: {
        statements: { pct: 40 },
        branches: { pct: 35 },
        functions: { pct: 38 },
        lines: { pct: 39 },
      },
    })
  );
  fs.writeFileSync(
    baseline,
    JSON.stringify({ floors: { statements: 38, branches: 33, functions: 37, lines: 37 } })
  );
  const result = run('node', [
    'scripts/quality/check-coverage-ratchet.mjs',
    '--summary',
    summary,
    '--baseline',
    baseline,
  ]);
  assertPass('coverage ratchet non-regression', result);
}

// Missing Istanbul coverage-final must fail closed for diff coverage.
{
  const missing = path.join(tmp, 'missing-final.json');
  const result = run('node', [
    'scripts/quality/check-diff-coverage.mjs',
    '--coverage',
    missing,
    '--floor',
    '80',
  ]);
  assertFail('missing coverage-final for diff coverage', result);
}

// Diff-coverage floor must fail when instrumented forced lines are uncovered.
{
  const coveragePath = path.join(tmp, 'coverage-final-low.json');
  const relFile = 'apps/api/src/app.controller.ts';
  const absFile = path.resolve(root, relFile);
  fs.writeFileSync(
    coveragePath,
    JSON.stringify({
      [absFile]: {
        path: absFile,
        statementMap: {
          0: { start: { line: 1, column: 0 }, end: { line: 1, column: 10 } },
          1: { start: { line: 2, column: 0 }, end: { line: 2, column: 10 } },
        },
        s: { 0: 0, 1: 0 },
      },
    })
  );
  const result = run('node', [
    'scripts/quality/check-diff-coverage.mjs',
    '--coverage',
    coveragePath,
    '--floor',
    '80',
    '--force-lines',
    `${relFile}:1,2`,
  ]);
  assertFail('diff coverage below floor', result);
}

// Format check must fail on intentionally unformatted authored content.
{
  const bad = path.join(tmp, 'bad-format.ts');
  fs.writeFileSync(bad, 'export const x={a:1,b:2}\n');
  const result = run('pnpm', ['exec', 'prettier', '--check', bad], { cwd: root });
  assertFail('prettier format regression', result);
}

// ESLint must fail on an intentional syntax/rule violation in authored TS.
{
  const badLint = path.join(tmp, 'bad-lint.mjs');
  fs.writeFileSync(
    badLint,
    `import eslint from '@eslint/js';
export default [eslint.configs.recommended, { files: ['**/*.js'], rules: { 'no-undef': 'error' } }];
`
  );
  const badSrc = path.join(tmp, 'bad-src.js');
  fs.writeFileSync(badSrc, 'notDefined();\n');
  const result = run('pnpm', ['exec', 'eslint', '--config', badLint, badSrc], { cwd: root });
  assertFail('eslint lint regression', result);
}

// Jest must fail closed when configured to discover no tests.
{
  const emptyDir = path.join(tmp, 'empty-tests');
  fs.mkdirSync(emptyDir, { recursive: true });
  const result = run(
    'pnpm',
    [
      'exec',
      'jest',
      '--passWithNoTests=false',
      '--testPathPatterns=definitely-no-such-suite',
      '--roots',
      emptyDir,
    ],
    { cwd: path.join(root, 'apps/api') }
  );
  assertFail('jest discovers no tests', result);
}

console.log('Negative proofs completed.');
fs.rmSync(tmp, { recursive: true, force: true });
