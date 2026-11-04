import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import test from 'node:test';
import { checkEnumsDrift } from '../check-enums-drift.mjs';

const repoRoot = process.cwd();
const schemaPath = resolve(repoRoot, 'apps/api/prisma/schema.prisma');
const committedPath = resolve(repoRoot, 'packages/types/src/enums.generated.ts');

function withTempDir(run) {
  const dir = mkdtempSync(join(tmpdir(), 'ttw-008-'));
  try {
    return run(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

test('checkEnumsDrift passes on the committed repository files', () => {
  assert.equal(checkEnumsDrift({ schemaPath, committedPath }), false);
});

test('checkEnumsDrift reports a committed file missing a schema enum', () => {
  withTempDir((dir) => {
    const stale = join(dir, 'enums.generated.ts');
    const committed = readFileSync(committedPath, 'utf8');
    const withoutEnum = committed.replace(
      /\n[^\n]*\nexport enum DeadLetterAckStatus \{[^}]*\}\n/,
      '\n'
    );
    assert.notEqual(withoutEnum, committed, 'fixture must remove an enum');
    writeFileSync(stale, withoutEnum);

    assert.equal(checkEnumsDrift({ schemaPath, committedPath: stale }), true);
  });
});

test('checkEnumsDrift reports a schema enum added after generation', () => {
  withTempDir((dir) => {
    const schema = join(dir, 'schema.prisma');
    writeFileSync(schema, `${readFileSync(schemaPath, 'utf8')}\nenum DriftProbe {\n  ADDED\n}\n`);

    assert.equal(checkEnumsDrift({ schemaPath: schema, committedPath }), true);
  });
});
