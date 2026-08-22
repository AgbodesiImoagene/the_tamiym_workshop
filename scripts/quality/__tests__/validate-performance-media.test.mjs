import assert from 'node:assert/strict';
import test from 'node:test';
import { validatePerformanceMedia } from '../validate-performance-media.mjs';

test('validatePerformanceMedia passes on repository root', () => {
  const errors = validatePerformanceMedia();
  assert.equal(errors.length, 0);
});
