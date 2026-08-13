import js from '@eslint/js';
import globals from 'globals';
import prettierConfig from 'eslint-config-prettier';

// ESLint flat config. Prettier owns formatting (eslint-config-prettier disables
// every stylistic rule that would conflict), so ESLint here is purely about
// correctness. `tsc --noEmit` (checkJs) is the separate type-soundness gate,
// run via the `lint` script and the build.
export default [
  {
    // Generated or build output, and every top-level dot-directory: those hold
    // tooling, caches, and local working material, never library source. The
    // rule is stated by shape rather than by listing names, so a new one cannot
    // turn `pnpm lint` red for reasons that have nothing to do with the library.
    ignores: ['dist/**', 'coverage/**', 'docs/api/**', '.*/**'],
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
    rules: {
      // `ignoreRestSiblings` (the rule's own default, restated because
      // js.configs.recommended does not set it) exempts exactly one pattern:
      // names destructured alongside a `...rest` element. That pattern *is* the
      // unknown-key contract for descriptor shapes — `const { key, label, ...unknown } = column`
      // declares the accepted set so `unknown` can be asserted empty
      // (ADR-0047, extended to descriptors by ADR-0056). The keys a descriptor's
      // validation does not itself read are still named there deliberately, so
      // flagging them as unused would fight the contract rather than find a bug.
      'no-unused-vars': ['error', { ignoreRestSiblings: true }],
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
