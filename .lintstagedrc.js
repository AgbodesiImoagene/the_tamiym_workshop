// lint-staged configuration
// Runs ESLint and Prettier on staged files
// ESLint will automatically find the nearest config for each file

export default {
  '*.{ts,tsx,js,jsx}': [
    // ESLint will find configs in subdirectories automatically
    // Suppress warnings about ignored files and files without configs
    'eslint --fix --max-warnings=0 --no-warn-ignored --quiet',
    'prettier --write',
  ],
  '*.{json,md}': ['prettier --write'],
};
