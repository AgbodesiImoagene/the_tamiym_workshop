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
};

export default createJestConfig(config);
