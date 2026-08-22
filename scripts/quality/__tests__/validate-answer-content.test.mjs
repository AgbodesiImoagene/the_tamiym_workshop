import assert from 'node:assert/strict';
import test from 'node:test';
import { validateAnswerContent } from '../validate-answer-content.mjs';

test('validateAnswerContent passes on repository root', () => {
  const errors = validateAnswerContent();
  assert.equal(errors.length, 0);
});
