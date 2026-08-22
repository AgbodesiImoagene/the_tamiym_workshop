import assert from 'node:assert/strict';
import test from 'node:test';
import { validateDiscoveryMetrics } from '../validate-discovery-metrics.mjs';

test('validateDiscoveryMetrics passes on repository root', () => {
  const errors = validateDiscoveryMetrics();
  assert.equal(errors.length, 0);
});
