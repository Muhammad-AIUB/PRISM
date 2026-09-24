// @ts-check
import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';

/**
 * Type-aware linting for the API. `recommendedTypeChecked` catches the bugs
 * that matter in this codebase in particular: floating promises (a runner
 * side effect nobody awaited), misused promises in callbacks, and unsafe
 * `any` flowing out of JSON.parse and model output.
 */
export default tseslint.config(
  { ignores: ['dist/**', 'coverage/**', 'scripts/**', 'eslint.config.mjs'] },
  eslint.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,
  {
    languageOptions: {
      parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname },
    },
    rules: {
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/no-misused-promises': 'error',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      // esModuleInterop is off, so CommonJS packages are imported with
      // `import x = require('x')` (CLAUDE.md). That form is typed; bare
      // require() calls are still refused.
      '@typescript-eslint/no-require-imports': ['error', { allowAsImport: true }],
    },
  },
  {
    // Tests build partial doubles on purpose (`{} as never`) and assert on
    // mock internals; the unsafe-* family flags exactly that and nothing else.
    files: ['**/*.spec.ts'],
    rules: {
      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/no-unsafe-member-access': 'off',
      '@typescript-eslint/no-unsafe-call': 'off',
      '@typescript-eslint/no-unsafe-argument': 'off',
      '@typescript-eslint/no-unsafe-return': 'off',
      '@typescript-eslint/unbound-method': 'off',
      '@typescript-eslint/require-await': 'off',
    },
  },
);
