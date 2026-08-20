import {
  resolveApiRole,
  roleIncludes,
  shouldAutorunBullProcessors,
} from './api-role';

describe('api-role', () => {
  const original = process.env.API_ROLE;

  afterEach(() => {
    if (original === undefined) {
      delete process.env.API_ROLE;
    } else {
      process.env.API_ROLE = original;
    }
  });

  it('defaults to all', () => {
    delete process.env.API_ROLE;
    expect(resolveApiRole()).toBe('all');
  });

  it('rejects unknown roles', () => {
    expect(() => resolveApiRole('migrate')).toThrow(/Invalid API_ROLE/);
  });

  it('gates capabilities per role', () => {
    expect(roleIncludes('api', 'http')).toBe(true);
    expect(roleIncludes('api', 'worker')).toBe(false);
    expect(roleIncludes('api', 'scheduler')).toBe(false);
    expect(roleIncludes('worker', 'worker')).toBe(true);
    expect(roleIncludes('worker', 'http')).toBe(false);
    expect(roleIncludes('scheduler', 'scheduler')).toBe(true);
    expect(roleIncludes('all', 'scheduler')).toBe(true);
  });

  it('disables bull autorun in test and for non-worker roles', () => {
    expect(shouldAutorunBullProcessors('worker', 'test')).toBe(false);
    expect(shouldAutorunBullProcessors('api', 'production')).toBe(false);
    expect(shouldAutorunBullProcessors('worker', 'production')).toBe(true);
    expect(shouldAutorunBullProcessors('all', 'production')).toBe(true);
  });
});
