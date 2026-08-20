#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '../..');
const budget = JSON.parse(
  readFileSync(join(root, 'docs/infrastructure/ttw-060-resource-budget.json'), 'utf8'),
);

const hardSum = budget.containers.reduce((sum, c) => sum + c.hardMiB, 0);
const headroom = budget.host.memoryMiB - hardSum;
const ok =
  hardSum + budget.host.reservedHostHeadroomMiB <= budget.host.memoryMiB &&
  headroom >= budget.host.reservedHostHeadroomMiB &&
  budget.host.swapAllowedForCorrectness === false;

const report = {
  hardSumMiB: hardSum,
  hostMemoryMiB: budget.host.memoryMiB,
  headroomMiB: headroom,
  reservedHostHeadroomMiB: budget.host.reservedHostHeadroomMiB,
  ok,
};

process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
if (!ok) {
  process.exitCode = 1;
}
