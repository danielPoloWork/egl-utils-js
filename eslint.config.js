import js from '@eslint/js';
import globals from 'globals';
import prettierConfig from 'eslint-config-prettier';

// ESLint flat config. Prettier owns formatting (eslint-config-prettier disables
// every stylistic rule that would conflict), so ESLint here is purely about
// correctness. `tsc --noEmit` (checkJs) is the separate type-soundness gate,
// run via the `lint` script and the build.
export default [
  {
    // Generated, vendored, or build output — never linted.
    ignores: ['dist/**', 'coverage/**', '.eados-core/**'],
  },
  js.configs.recommended,
  {
    // Library source and tests: a universal library runs on Node and in the
    // browser, so both global sets are in scope.
    files: ['src/**/*.js'],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'module',
      globals: {
        ...globals.node,
        ...globals.browser,
      },
    },
  },
  {
    // Tooling configs and Node scripts run on Node only.
    files: ['*.config.js', 'eslint.config.js', 'tools/**/*.mjs'],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'module',
      globals: { ...globals.node },
    },
  },
  // Must stay last: turn off rules that fight the formatter.
  prettierConfig,
];
