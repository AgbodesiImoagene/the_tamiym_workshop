// Root ESLint config for monorepo
// This serves as a fallback - individual apps/packages have their own configs

import js from '@eslint/js';
import { FlatCompat } from '@eslint/eslintrc';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const compat = new FlatCompat({
  baseDirectory: __dirname,
  recommendedConfig: js.configs.recommended,
});

export default [
  // Ignore patterns
  {
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      '**/build/**',
      '**/.next/**',
      '**/coverage/**',
      '**/.turbo/**',
      '**/pnpm-lock.yaml',
      // Ignore all config files (they may use CommonJS and are not application code)
      '**/*.config.js',
      '**/*.config.mjs',
      '**/*.config.ts',
      '**/*.config.cjs',
      '**/tailwind.config.js',
      '**/eslint.config.js',
      '**/eslint.config.mjs',
      // Ignore root eslint.config.js itself
      'eslint.config.js',
      // Ignore .lintstagedrc.js
      '.lintstagedrc.js',
    ],
  },
  // Base recommended rules (fallback for root-level files only)
  // Files in apps/packages will use their own configs via ESLint's automatic resolution
  js.configs.recommended,
  // Prettier compatibility
  ...compat.extends('prettier'),
  {
    rules: {
      'no-console': ['warn', { allow: ['warn', 'error'] }],
    },
  },
];
