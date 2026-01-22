const { FlatCompat } = require('@eslint/eslintrc');
const js = require('@eslint/js');
const prettier = require('eslint-config-prettier');
const compat = new FlatCompat({
  baseDirectory: __dirname,
});

module.exports = [
  js.configs.recommended,
  ...compat.extends('next/core-web-vitals', 'prettier'),
  prettier,
  {
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
        },
      ],
      'no-console': ['warn', { allow: ['warn', 'error'] }],
    },
  },
];
