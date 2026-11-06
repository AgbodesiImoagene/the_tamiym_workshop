#!/usr/bin/env node
/**
 * Runs API e2e with --detectOpenHandles and fails if Jest reports open handles
 * or if the suite does not exit within the allotted time.
 *
 * Jest runs in its own process group so a timeout or an interruption can stop
 * the whole tree: killing `pnpm` alone leaves `jest` holding the output pipes,
 * and the `close` event then never fires.
 *
 * E2E_OPEN_HANDLE_TIMEOUT_MS: time allowed for the suite (default 120000).
 * E2E_OPEN_HANDLE_GRACE_MS: wait after the kill before exiting (default 5000).
 * E2E_OPEN_HANDLE_COMMAND: JSON array replacing the command (used by tests).
 */
import { spawn } from 'node:child_process';
import path from 'node:path';

const apiRoot = path.resolve(process.cwd(), 'apps/api');
const timeoutMs = Number(process.env.E2E_OPEN_HANDLE_TIMEOUT_MS || 120_000);
const graceMs = Number(process.env.E2E_OPEN_HANDLE_GRACE_MS || 5_000);

const defaultCommand = [
  'pnpm',
  'exec',
  'jest',
  '--config',
  './test/jest-e2e.json',
  '--runInBand',
  '--detectOpenHandles',
];
const [command, ...args] = process.env.E2E_OPEN_HANDLE_COMMAND
  ? JSON.parse(process.env.E2E_OPEN_HANDLE_COMMAND)
  : defaultCommand;

const child = spawn(command, args, {
  cwd: apiRoot,
  detached: true,
  env: {
    ...process.env,
    NODE_ENV: 'test',
    NODE_OPTIONS: '--experimental-vm-modules',
  },
  stdio: ['ignore', 'pipe', 'pipe'],
});

let output = '';
child.stdout.on('data', (chunk) => {
  const text = String(chunk);
  output += text;
  process.stdout.write(text);
});
child.stderr.on('data', (chunk) => {
  const text = String(chunk);
  output += text;
  process.stderr.write(text);
});

function killProcessGroup() {
  try {
    process.kill(-child.pid, 'SIGKILL');
  } catch (error) {
    if (error.code !== 'ESRCH') {
      console.error(`Could not kill process group ${child.pid}: ${error.message}`);
    }
  }
}

let timedOut = false;
const timer = setTimeout(() => {
  timedOut = true;
  console.error(`Open-handle proof timed out after ${timeoutMs}ms (likely leaked handles).`);
  console.error(`Killing process group ${child.pid}.`);
  killProcessGroup();
  setTimeout(() => process.exit(1), graceMs);
}, timeoutMs);

// The detached group no longer receives terminal or CI signals by itself.
for (const [signal, exitCode] of [
  ['SIGHUP', 129],
  ['SIGINT', 130],
  ['SIGTERM', 143],
]) {
  process.on(signal, () => {
    killProcessGroup();
    process.exit(exitCode);
  });
}

child.on('close', (code, signal) => {
  clearTimeout(timer);
  if (timedOut || signal) {
    process.exit(1);
  }
  if (code !== 0 && code !== null) {
    process.exit(code);
  }
  if (/Jest has detected the following \d+ open handle/i.test(output)) {
    console.error('Open-handle proof failed: Jest reported open handles.');
    process.exit(1);
  }
  console.log('Open-handle proof passed: no open handles reported.');
  process.exit(0);
});
