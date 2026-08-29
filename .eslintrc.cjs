module.exports = {
  root: true,
  env: { node: true, es2022: true, browser: true, es6: true },
  parser: '@typescript-eslint/parser',
  parserOptions: { ecmaVersion: 2022, sourceType: 'module', ecmaFeatures: { jsx: true } },
  plugins: ['@typescript-eslint'],
  extends: ['eslint:recommended'],
  rules: {
    'no-empty': 'warn',
    'no-console': 'off',
    'no-unused-vars': 'off',
    '@typescript-eslint/no-explicit-any': 'off',
    '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
  },
  overrides: [
    {
      files: ['**/*.ts', '**/*.tsx'],
      rules: {
        // TypeScript resolves types and globals during type-checking; ESLint's
        // core no-undef rule does not understand those symbols.
        'no-undef': 'off',
      },
    },
    {
      files: ['**/*.test.ts', '**/*.spec.ts', '**/tests/**/*.ts'],
      env: { jest: true },
    },
  ],
  ignorePatterns: ['dist', '.next', 'node_modules', '*.js'],
};
