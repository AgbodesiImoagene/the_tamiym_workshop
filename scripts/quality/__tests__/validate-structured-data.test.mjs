import assert from 'node:assert/strict';
import test from 'node:test';
import { validateStructuredData } from '../validate-structured-data.mjs';

test('validateStructuredData passes on repository root', () => {
  const errors = validateStructuredData();
  assert.equal(errors.length, 0);
});
