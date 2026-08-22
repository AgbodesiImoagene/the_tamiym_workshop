import assert from 'node:assert/strict';
import test from 'node:test';
import { validateWebSeo } from '../validate-web-seo.mjs';

test('validateWebSeo passes on repository root', () => {
  const errors = validateWebSeo();
  assert.equal(errors.length, 0);
});
