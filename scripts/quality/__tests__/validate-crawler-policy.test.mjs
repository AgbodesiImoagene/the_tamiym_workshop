import assert from 'node:assert/strict';
import test from 'node:test';
import { validateCrawlerPolicy } from '../validate-crawler-policy.mjs';

test('validateCrawlerPolicy passes on repository root', () => {
  const errors = validateCrawlerPolicy();
  assert.equal(errors.length, 0);
});
