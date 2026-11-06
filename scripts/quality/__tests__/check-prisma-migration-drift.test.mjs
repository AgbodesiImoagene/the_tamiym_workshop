import assert from 'node:assert/strict';
import test from 'node:test';
import {
  checkPrismaMigrationDrift,
  redactConnectionStrings,
  shadowTargetErrors,
} from '../check-prisma-migration-drift.mjs';

const DATABASE_URL = 'postgresql://postgres:secret@localhost:5432/tamiym_workshop?schema=public';
const SHADOW_DATABASE_URL =
  'postgresql://postgres:secret@localhost:5432/tamiym_workshop_shadow?schema=public';

function prismaExit(status, { stdout = '', stderr = '' } = {}) {
  return Object.assign(new Error(`Command failed with exit code ${status}`), {
    status,
    stdout,
    stderr,
  });
}

test('an empty diff passes and runs the schema-to-migrations comparison', () => {
  const calls = [];
  const result = checkPrismaMigrationDrift({
    env: { DATABASE_URL, SHADOW_DATABASE_URL },
    run: (root, args, env) => {
      calls.push({ args, env });
      return '';
    },
  });

  assert.deepEqual(result, { ok: true, errors: [] });
  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0].args, [
    'migrate',
    'diff',
    '--from-migrations',
    'prisma/migrations',
    '--to-schema',
    'prisma/schema.prisma',
    '--script',
    '--exit-code',
  ]);
  assert.equal(calls[0].env.SHADOW_DATABASE_URL, SHADOW_DATABASE_URL);
});

test('a non-empty diff fails and reports the statements Prisma would run', () => {
  const statement = 'ALTER TABLE "bulk_pricing" DROP COLUMN "quantityRange";';
  const result = checkPrismaMigrationDrift({
    env: { DATABASE_URL, SHADOW_DATABASE_URL },
    run: () => {
      throw prismaExit(2, { stdout: `-- AlterTable\n${statement}\n` });
    },
  });

  assert.equal(result.ok, false);
  assert.match(result.errors.join('\n'), /schema\.prisma and the migrations disagree/);
  assert.ok(result.errors.join('\n').includes(statement));
});

test('a Prisma failure fails closed instead of passing silently', () => {
  const result = checkPrismaMigrationDrift({
    env: { DATABASE_URL, SHADOW_DATABASE_URL },
    run: () => {
      throw prismaExit(1, { stderr: "Error: P1001: Can't reach database server" });
    },
  });

  assert.equal(result.ok, false);
  assert.match(result.errors.join('\n'), /could not compare/);
  assert.match(result.errors.join('\n'), /P1001/);
});

test('a missing DATABASE_URL fails without calling Prisma', () => {
  let called = false;
  const result = checkPrismaMigrationDrift({
    env: {},
    run: () => {
      called = true;
      return '';
    },
  });

  assert.equal(result.ok, false);
  assert.match(result.errors.join('\n'), /DATABASE_URL is required/);
  assert.equal(called, false);
});

test('the shadow URL is derived from DATABASE_URL when it is not set', () => {
  let shadow;
  const result = checkPrismaMigrationDrift({
    env: { DATABASE_URL },
    run: (root, args, env) => {
      shadow = env.SHADOW_DATABASE_URL;
      return '';
    },
  });

  assert.equal(result.ok, true);
  assert.equal(new URL(shadow).pathname, '/tamiym_workshop_shadow');
});

test('a shadow database that could be real data is refused before Prisma resets it', () => {
  for (const shadowUrl of [
    DATABASE_URL,
    'postgresql://postgres:secret@localhost:5432/tamiym_workshop_test',
  ]) {
    let called = false;
    const result = checkPrismaMigrationDrift({
      env: { DATABASE_URL, SHADOW_DATABASE_URL: shadowUrl },
      run: () => {
        called = true;
        return '';
      },
    });

    assert.equal(result.ok, false, shadowUrl);
    assert.equal(called, false, shadowUrl);
  }
});

test('a shadow URL with extra path segments is refused, because Prisma uses the first one', () => {
  assert.match(
    shadowTargetErrors(
      DATABASE_URL,
      'postgresql://postgres:secret@localhost:5432/victim/shadow'
    ).join('\n'),
    /a single database name/
  );
});

test('an empty database name is refused, because Postgres falls back to the user name', () => {
  for (const shadowUrl of [
    'postgresql://postgres:secret@localhost:5432//app_shadow',
    'postgresql://postgres:secret@localhost:5432/',
    'postgresql://postgres:secret@localhost:5432',
  ]) {
    assert.match(
      shadowTargetErrors(DATABASE_URL, shadowUrl).join('\n'),
      /a single database name/,
      shadowUrl
    );
  }
});

test('a name Postgres would truncate is refused, because it may reach another database', () => {
  const longest = `${'a'.repeat(57)}shadow`;
  assert.deepEqual(
    shadowTargetErrors(DATABASE_URL, `postgresql://postgres@localhost:5432/${longest}`),
    []
  );

  const main = 'a'.repeat(63);
  const result = checkPrismaMigrationDrift({
    env: { DATABASE_URL: `postgresql://postgres@localhost:5432/${main}` },
    run: () => {
      throw new Error('Prisma must not run');
    },
  });
  assert.equal(result.ok, false);
  assert.match(result.errors.join('\n'), /63 bytes/);
});

test('a trailing slash after the database name is accepted', () => {
  assert.deepEqual(
    shadowTargetErrors(DATABASE_URL, 'postgresql://postgres:secret@localhost:5432/app_shadow/'),
    []
  );
});

test('the same database behind a host alias is refused', () => {
  assert.match(
    shadowTargetErrors(
      'postgresql://postgres:secret@localhost:5432/app_shadow',
      'postgresql://postgres:secret@127.0.0.1:5432/app_shadow'
    ).join('\n'),
    /same database/
  );
});

test('an encoded database name is checked as Prisma would read it', () => {
  assert.match(
    shadowTargetErrors(
      'postgresql://postgres:secret@localhost:5432/app_shadow',
      'postgresql://postgres:secret@localhost:5432/app%5Fshadow'
    ).join('\n'),
    /same database/
  );
});

test('shadowTargetErrors accepts a dedicated shadow database and rejects invalid URLs', () => {
  assert.deepEqual(shadowTargetErrors(DATABASE_URL, SHADOW_DATABASE_URL), []);
  assert.match(shadowTargetErrors(DATABASE_URL, 'not a url').join('\n'), /not a valid URL/);
  assert.match(shadowTargetErrors(DATABASE_URL, undefined).join('\n'), /not a valid URL/);
  assert.match(
    shadowTargetErrors(SHADOW_DATABASE_URL, SHADOW_DATABASE_URL).join('\n'),
    /same database/
  );
});

test('connection strings never reach the reported errors', () => {
  const result = checkPrismaMigrationDrift({
    env: { DATABASE_URL, SHADOW_DATABASE_URL },
    run: () => {
      throw prismaExit(1, { stderr: `Cannot connect to ${SHADOW_DATABASE_URL}` });
    },
  });

  assert.equal(result.ok, false);
  assert.doesNotMatch(result.errors.join('\n'), /secret/);
  assert.equal(
    redactConnectionStrings('see postgres://u:p@h:1/d?x=1 now'),
    'see <database-url> now'
  );
});
