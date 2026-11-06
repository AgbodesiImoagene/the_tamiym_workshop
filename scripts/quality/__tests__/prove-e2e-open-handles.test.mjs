import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import test from 'node:test';

const scriptPath = resolve(process.cwd(), 'scripts/quality/prove-e2e-open-handles.mjs');

const TIMEOUT_MS = 1_500;
const GRACE_MS = 500;
const SLOW_MACHINE_MARGIN_MS = 5_000;
const HANG_LIMIT_MS = 15_000;

function isAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

async function waitUntilGone(pid) {
  for (let attempt = 0; attempt < 40 && isAlive(pid); attempt += 1) {
    await delay(50);
  }
  return !isAlive(pid);
}

function setup(t) {
  const dir = mkdtempSync(join(tmpdir(), 'ttw-080-'));
  const pidFile = join(dir, 'pids');

  t.after(() => {
    for (const pid of readPids(pidFile)) {
      try {
        process.kill(pid, 'SIGKILL');
      } catch {
        // Already gone, which is what the passing cases expect.
      }
    }
    rmSync(dir, { recursive: true, force: true });
  });

  return { dir, pidFile };
}

function readPids(pidFile) {
  if (!existsSync(pidFile)) {
    return [];
  }
  return readFileSync(pidFile, 'utf8').trim().split(' ').filter(Boolean).map(Number);
}

async function waitForPids(pidFile) {
  for (let attempt = 0; attempt < 200; attempt += 1) {
    const pids = readPids(pidFile);
    if (pids.length === 2) {
      return pids;
    }
    await delay(25);
  }
  throw new Error('fake child never recorded its process ids');
}

function writeFixture(dir, source) {
  const fixture = join(dir, 'fake-child.mjs');
  writeFileSync(fixture, source);
  return fixture;
}

/**
 * Fake `pnpm`: starts a long-lived fake `jest` that inherits its stdout/stderr,
 * so the pipes stay open for as long as that grandchild lives.
 */
function writeTreeFixture(dir, pidFile, { leaderExits = false, escapesGroup = false } = {}) {
  return writeFixture(
    dir,
    `
    import { spawn } from 'node:child_process';
    import { writeFileSync } from 'node:fs';

    const grandchild = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], {
      stdio: 'inherit',
      detached: ${escapesGroup},
    });
    writeFileSync(${JSON.stringify(pidFile)}, process.pid + ' ' + grandchild.pid);
    ${leaderExits ? 'process.exit(0);' : 'setInterval(() => {}, 1000);'}
    `
  );
}

function startProof(fixture, env = {}) {
  const startedAt = Date.now();
  const child = spawn(process.execPath, [scriptPath], {
    env: {
      ...process.env,
      E2E_OPEN_HANDLE_COMMAND: JSON.stringify([process.execPath, fixture]),
      E2E_OPEN_HANDLE_TIMEOUT_MS: String(TIMEOUT_MS),
      E2E_OPEN_HANDLE_GRACE_MS: String(GRACE_MS),
      ...env,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  let stdout = '';
  let stderr = '';
  child.stdout.on('data', (chunk) => {
    stdout += String(chunk);
  });
  child.stderr.on('data', (chunk) => {
    stderr += String(chunk);
  });

  const finished = new Promise((resolvePromise) => {
    let hung = false;
    const hangGuard = setTimeout(() => {
      hung = true;
      child.kill('SIGKILL');
    }, HANG_LIMIT_MS);

    child.on('close', (code, signal) => {
      clearTimeout(hangGuard);
      resolvePromise({ code, signal, hung, stdout, stderr, elapsedMs: Date.now() - startedAt });
    });
  });

  return { child, finished };
}

function assertTimedOutFast(result) {
  assert.equal(result.hung, false, 'the proof must exit by itself instead of hanging');
  assert.notEqual(result.code, 0);
  assert.ok(
    result.elapsedMs < TIMEOUT_MS + GRACE_MS + SLOW_MACHINE_MARGIN_MS,
    `exited after ${result.elapsedMs}ms`
  );
  assert.match(result.stderr, new RegExp(`Open-handle proof timed out after ${TIMEOUT_MS}ms`));
}

function recordedPids(pidFile) {
  const pids = readPids(pidFile);
  assert.equal(pids.length, 2, 'the fake child must record its process ids before the timeout');
  return pids;
}

test('a timed-out run exits non-zero and leaves no process behind', async (t) => {
  const { dir, pidFile } = setup(t);
  const { finished } = startProof(writeTreeFixture(dir, pidFile));

  const result = await finished;

  assertTimedOutFast(result);
  const [leaderPid, grandchildPid] = recordedPids(pidFile);
  assert.match(result.stderr, new RegExp(`process group ${leaderPid}\\b`));
  assert.equal(await waitUntilGone(leaderPid), true, 'fake pnpm survived');
  assert.equal(await waitUntilGone(grandchildPid), true, 'fake jest survived');
});

test('a timed-out run fails even when only a grandchild still holds the pipes', async (t) => {
  const { dir, pidFile } = setup(t);
  const { finished } = startProof(writeTreeFixture(dir, pidFile, { leaderExits: true }));

  const result = await finished;

  assertTimedOutFast(result);
  assert.doesNotMatch(result.stdout, /Open-handle proof passed/);
  const [, grandchildPid] = recordedPids(pidFile);
  assert.equal(await waitUntilGone(grandchildPid), true, 'fake jest survived');
});

test('a timed-out run exits after the grace period when a process escapes the group', async (t) => {
  const { dir, pidFile } = setup(t);
  const { finished } = startProof(writeTreeFixture(dir, pidFile, { escapesGroup: true }));

  const result = await finished;

  assertTimedOutFast(result);
  assert.ok(result.elapsedMs >= TIMEOUT_MS + GRACE_MS, `exited after ${result.elapsedMs}ms`);
});

for (const [signal, expectedCode] of [
  ['SIGHUP', 129],
  ['SIGINT', 130],
  ['SIGTERM', 143],
]) {
  test(`${signal} stops the proof and leaves no process behind`, async (t) => {
    const { dir, pidFile } = setup(t);
    const { child, finished } = startProof(writeTreeFixture(dir, pidFile), {
      E2E_OPEN_HANDLE_TIMEOUT_MS: '60000',
    });

    const [leaderPid, grandchildPid] = await waitForPids(pidFile);
    child.kill(signal);
    const result = await finished;

    assert.equal(result.hung, false, 'the proof must exit by itself instead of hanging');
    assert.equal(result.code, expectedCode);
    assert.equal(await waitUntilGone(leaderPid), true, 'fake pnpm survived');
    assert.equal(await waitUntilGone(grandchildPid), true, 'fake jest survived');
  });
}

test('a run that finishes in time passes and keeps its output', async (t) => {
  const { dir } = setup(t);
  const fixture = writeFixture(
    dir,
    `
    console.log('Tests: 93 passed');
    console.error('from stderr');
    `
  );

  const result = await startProof(fixture).finished;

  assert.equal(result.code, 0);
  assert.match(result.stdout, /Tests: 93 passed/);
  assert.match(result.stderr, /from stderr/);
  assert.match(result.stdout, /Open-handle proof passed: no open handles reported\./);
});

test('a failing child keeps its exit code', async (t) => {
  const { dir } = setup(t);
  const fixture = writeFixture(dir, 'process.exit(7);');

  const result = await startProof(fixture).finished;

  assert.equal(result.code, 7);
  assert.doesNotMatch(result.stdout, /Open-handle proof passed/);
});

test('a child killed by a signal fails the proof', async (t) => {
  const { dir } = setup(t);
  const fixture = writeFixture(dir, "process.kill(process.pid, 'SIGKILL');");

  const result = await startProof(fixture).finished;

  assert.equal(result.code, 1);
  assert.doesNotMatch(result.stdout, /Open-handle proof passed/);
});

test('open handles reported by Jest fail the proof', async (t) => {
  const { dir } = setup(t);
  const fixture = writeFixture(
    dir,
    "console.log('Jest has detected the following 1 open handle potentially keeping Jest from exiting:');"
  );

  const result = await startProof(fixture).finished;

  assert.equal(result.code, 1);
  assert.match(result.stderr, /Jest reported open handles/);
  assert.doesNotMatch(result.stdout, /Open-handle proof passed/);
});
