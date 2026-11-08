import type { Config } from 'jest';
import nextJest from 'next/jest.js';

const createJestConfig = nextJest({ dir: './' });

const config: Config = {
  testEnvironment: 'jest-environment-jsdom',
  setupFilesAfterEnv: ['<rootDir>/jest.setup.ts'],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/$1',
    '^@tamiym/ui$': '<rootDir>/../../packages/ui/src/index.ts',
  },
  testMatch: ['<rootDir>/__tests__/**/*.{ts,tsx}'],
  // Hang detector, not a performance check: no test here asserts on duration. Under the
  // parallel `pnpm test` (turbo runs every package's Jest at once), CPU starvation slowed
  // a 1.0 s test to 11.9 s and broke the 5 s default (TTW-182).
  testTimeout: 30_000,
};

export default createJestConfig(config);
