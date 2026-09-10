const tseslint = require('typescript-eslint');
const react = require('eslint-plugin-react');
const reactHooks = require('eslint-plugin-react-hooks');

module.exports = tseslint.config(
  {
    ignores: [
      'dist/**',
      'coverage/**',
      'node_modules/**',
      '.claude/**',
      'scratch/**',
      'scripts/**',
      '*.js',
      '*.ts',
    ],
  },
  {
    files: ['src/**/*.{ts,tsx}', 'demo/**/*.{ts,tsx}'],
    extends: [
      ...tseslint.configs.recommendedTypeChecked,
      react.configs.flat.recommended,
      reactHooks.configs.flat.recommended,
    ],
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: __dirname,
      },
    },
    settings: {
      react: { version: 'detect' },
    },
    rules: {
      // Honor the underscore convention for intentionally unused bindings
      // (e.g. `(_ctx) => null` callbacks matching an expected signature).
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
        },
      ],
    },
  },
  {
    // Browser tests are excluded from tsconfig.json, so no type info is
    // available; run them with type-aware rules off.
    files: ['src/__tests__/browser/**'],
    extends: [tseslint.configs.disableTypeChecked],
  }
);
