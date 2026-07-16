import { defineConfig } from 'tsup';

// Dual ESM/CJS build (ADR-001): dist/esm + dist/cjs from the same four entry
// points the package.json exports map declares. Type declarations are NOT
// produced here — tsup's dts pipeline expects TypeScript sources; this project
// is JSDoc-typed JavaScript, so `tsc -p tsconfig.build.json` emits dist/types
// from the JSDoc annotations (see the build script).
const entry = {
  index: 'src/main/javascript/it/d4np/utils/index.js',
  storage: 'src/main/javascript/it/d4np/utils/storage.js',
  sanitize: 'src/main/javascript/it/d4np/utils/sanitize.js',
  errors: 'src/main/javascript/it/d4np/utils/errors.js',
};

const shared = {
  entry,
  // Universal library: no Node or browser built-ins assumed at bundle time.
  platform: 'neutral',
  target: 'es2022',
  sourcemap: true,
  clean: true,
};

export default defineConfig([
  {
    ...shared,
    format: 'esm',
    outDir: 'dist/esm',
  },
  {
    ...shared,
    format: 'cjs',
    outDir: 'dist/cjs',
    // package.json is "type": "module", so CommonJS artifacts must be .cjs.
    outExtension: () => ({ js: '.cjs' }),
  },
]);
