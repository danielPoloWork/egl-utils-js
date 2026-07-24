import { defineConfig } from 'tsup';

// Dual ESM/CJS build (ADR-001): dist/esm + dist/cjs from the same four entry
// points the package.json exports map declares, each with a per-format type
// declaration (.d.ts for ESM, .d.cts for CJS) so a CJS consumer's types match
// its runtime format — arethetypeswrong (`pnpm check:exports`) enforces this.
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
  // Emit declarations from the JSDoc-typed sources, per format.
  dts: true,
};

// The root entry is additionally built per platform (ADR-0008): the neutral
// build above resolves `#webcrypto` to the browser shim (`default` condition
// of package.json `imports`) and stays free of `node:` built-ins — the file
// agadoo/size-limit gate (NFR-01/02); the node build resolves the `node`
// condition (globalThis.crypto ?? node:crypto webcrypto, covering the Node 18
// floor) and is served through the exports map's `node` condition.
const nodeRootEntry = {
  entry: { index: 'src/main/javascript/it/d4np/utils/index.js' },
  platform: 'node',
  target: 'es2022',
  sourcemap: true,
  clean: true,
  dts: true,
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
    // package.json is "type": "module", so CommonJS artifacts must be .cjs/.d.cts.
    outExtension: () => ({ js: '.cjs' }),
  },
  {
    ...nodeRootEntry,
    format: 'esm',
    outDir: 'dist/node/esm',
  },
  {
    ...nodeRootEntry,
    format: 'cjs',
    outDir: 'dist/node/cjs',
    outExtension: () => ({ js: '.cjs' }),
  },
]);
