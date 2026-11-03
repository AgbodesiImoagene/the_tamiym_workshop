import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { validateWorkflows } from '../validate-workflows.mjs';

function withWorkflows(files, run) {
  const root = mkdtempSync(join(tmpdir(), 'ttw-006-'));
  try {
    const dir = join(root, '.github/workflows');
    mkdirSync(dir, { recursive: true });
    for (const [name, content] of Object.entries(files)) {
      writeFileSync(join(dir, name), content);
    }
    return run(root);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

const workflow = (stepName) => `name: Example
on:
  workflow_dispatch:
jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - name: ${stepName}
        run: echo ok
`;

test('validateWorkflows passes on repository root', () => {
  const errors = validateWorkflows();
  assert.deepEqual(errors, []);
});

test('validateWorkflows reports an unquoted ": " in a step name with file and line', () => {
  const errors = withWorkflows({ 'rc.yml': workflow('Build web image (push: false)') }, (root) =>
    validateWorkflows({ repoRoot: root })
  );
  assert.equal(errors.length, 1);
  assert.match(errors[0].message, /^\.github\/workflows\/rc\.yml:8: invalid YAML/);
});

test('validateWorkflows accepts the same step name when quoted', () => {
  const errors = withWorkflows({ 'rc.yml': workflow('"Build web image (push: false)"') }, (root) =>
    validateWorkflows({ repoRoot: root })
  );
  assert.deepEqual(errors, []);
});

test('validateWorkflows reports a workflow without jobs', () => {
  const errors = withWorkflows({ 'empty.yaml': 'name: Empty\non: push\n' }, (root) =>
    validateWorkflows({ repoRoot: root })
  );
  assert.deepEqual(
    errors.map((error) => error.message),
    ['.github/workflows/empty.yaml: missing required top-level key "jobs"']
  );
});

test('validateWorkflows reports a workflow that is not a mapping', () => {
  const errors = withWorkflows({ 'list.yml': '- just\n- a list\n' }, (root) =>
    validateWorkflows({ repoRoot: root })
  );
  assert.deepEqual(
    errors.map((error) => error.message),
    ['.github/workflows/list.yml: workflow must be a YAML mapping']
  );
});

test('validateWorkflows ignores non-YAML files', () => {
  const errors = withWorkflows({ 'README.md': 'not: [valid' }, (root) =>
    validateWorkflows({ repoRoot: root })
  );
  assert.deepEqual(errors, []);
});
