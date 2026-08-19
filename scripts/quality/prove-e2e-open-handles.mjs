#!/usr/bin/env node
/**
 * Runs API e2e with --detectOpenHandles and fails if Jest reports open handles
 * or if the suite does not exit within the allotted time.
 */
import { spawn } from 'node:child_process';
import path from 'node:path';

const apiRoot = path.resolve(process.cwd(), 'apps/api');
const timeoutMs = Number(process.env.E2E_OPEN_HANDLE_TIMEOUT_MS || 120_000);

const child = spawn(
  'pnpm',
  ['exec', 'jest', '--config', './test/jest-e2e.json', '--runInBand', '--detectOpenHandles'],
  {
    cwd: apiRoot,
    env: {
      ...process.env,
      NODE_ENV: 'test',
      NODE_OPTIONS: '--experimental-vm-modules',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  }
);

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

const timer = setTimeout(() => {
  console.error(`Open-handle proof timed out after ${timeoutMs}ms (likely leaked handles).`);
  child.kill('SIGKILL');
}, timeoutMs);

child.on('close', (code, signal) => {
  clearTimeout(timer);
  if (signal) {
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
