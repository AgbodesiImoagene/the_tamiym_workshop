// lint-staged configuration
// Runs ESLint and Prettier on staged files under src/ and test/ only (excludes scripts/)
// ESLint will automatically find the nearest config for each file

export default {
  '**/src/**/*.{ts,tsx,js,jsx}': [
    'eslint --fix --max-warnings=0 --no-warn-ignored --quiet',
    'prettier --write',
  ],
  '**/test/**/*.{ts,tsx,js,jsx}': [
    'eslint --fix --max-warnings=0 --no-warn-ignored --quiet',
    'prettier --write',
  ],
  '*.{json,md}': ['prettier --write'],
};
