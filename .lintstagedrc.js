// lint-staged configuration
// Runs ESLint and Prettier on staged files under src/ and test/ only (excludes scripts/)
// ESLint will automatically find the nearest config for each file

const isGeneratedSource = (file) => /\.generated\.[tj]sx?$/.test(file);

export default {
  '**/src/**/*.{ts,tsx,js,jsx}': (files) => {
    const source = files.filter((file) => !isGeneratedSource(file));
    if (source.length === 0) return [];
    return [
      `eslint --fix --max-warnings=0 --no-warn-ignored --quiet ${source.join(' ')}`,
      `prettier --write ${source.join(' ')}`,
    ];
  },
  '**/test/**/*.{ts,tsx,js,jsx}': [
    'eslint --fix --max-warnings=0 --no-warn-ignored --quiet',
    'prettier --write',
  ],
  '*.{json,md}': (files) => {
    const source = files.filter((file) => !file.includes('docs/openapi/openapi.json'));
    if (source.length === 0) return [];
    return [`prettier --write ${source.join(' ')}`];
  },
};
