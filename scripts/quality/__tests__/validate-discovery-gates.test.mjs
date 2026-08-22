import assert from 'node:assert/strict';
import test from 'node:test';
import { validateDiscoveryGateManifest } from '../discovery-gate-manifest-schema.mjs';
import { validateDiscoveryGates } from '../validate-discovery-gates.mjs';

test('validateDiscoveryGateManifest passes on repository root', () => {
  const errors = validateDiscoveryGateManifest();
  assert.equal(errors.length, 0);
});

test('validateDiscoveryGates passes on repository root', () => {
  const errors = validateDiscoveryGates();
  assert.equal(errors.length, 0);
});
