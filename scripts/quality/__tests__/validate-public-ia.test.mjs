import assert from 'node:assert/strict';
import test from 'node:test';
import { validatePublicIa } from '../validate-public-ia.mjs';

test('validatePublicIa passes on repository root', () => {
  const errors = validatePublicIa();
  assert.equal(errors.length, 0);
});
