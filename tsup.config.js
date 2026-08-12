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
  text: 'src/main/javascript/it/d4np/utils/text.js',
  net: 'src/main/javascript/it/d4np/utils/net.js',
  table: 'src/main/javascript/it/d4np/utils/table.js',
  logging: 'src/main/javascript/it/d4np/utils/logging.js',
  dom: 'src/main/javascript/it/d4np/utils/dom.js',
  bootstrap: 'src/main/javascript/it/d4np/utils/bootstrap.js',
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

// Two builds, not four. The root entry had a second, `platform: 'node'` pair
// (dist/node/{esm,cjs}) served through the exports map's `node` condition,
// because ADR-0008's node-side `#webcrypto` shim imported `node:crypto` for the
// Node 18 floor and that import must never reach a browser bundle. The 1.x
// floor is Node >= 22 (ADR-0050) and `globalThis.crypto` has been unflagged
// since Node 19, so the shim collapsed to one platform-neutral module and both
// node builds lost their reason to exist (ADR-0054, roadmap 17.14). The neutral
// pair below now serves every runtime — and it is the pair agadoo and
// size-limit already gate (NFR-01/02), so what CI measures is what every
// consumer gets.
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
]);
