// Spec 05 F87 gate: every documented no-bundler route has a measured, gated
// figure for what a browser actually downloads (roadmap 18.5).
//
// The 100 size-limit rows model a BUNDLER consumer — tree-shaken, bundled into
// one file, compressed once. A static page pays something different and larger:
// whole files, no tree-shaking, one compressed response per file. Nothing
// measured that until this gate, so the bytes the README's no-bundler section
// promises were the only unverified numbers left in the wave.
//
// Route figures and the reasoning behind them: `tools/transfer-budgets.js`.
import { readFileSync } from 'node:fs';
import { dirname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { brotliCompressSync } from 'node:zlib';
import { TRANSFER_ROUTES } from './transfer-budgets.js';

const ROOT = fileURLToPath(new URL('../', import.meta.url));

/**
 * Relative `import`/`export … from` specifiers, including the side-effect-only
 * `import "./chunk.js"` form that tsup emits for a chunk an entry re-exports
 * nothing from. Bare specifiers are ignored on purpose: this library ships none
 * (ADR-0055), and `tools/assert-global-artifact.mjs` plus the 18.1 browser suite
 * are what assert that.
 */
const SPECIFIER = /(?:import|export)\b[^'"]*?from\s*["']([^"']+)["']|import\s*["']([^"']+)["']/gm;

/**
 * Every file a browser fetches for one entry: the entry itself plus the
 * transitive closure of its relative imports.
 *
 * @param {string} entryFile - Absolute path to the entry.
 * @returns {string[]} Absolute paths, the entry included, deduplicated.
 */
function closureOf(entryFile) {
  const seen = new Set();
  const pending = [entryFile];
  while (pending.length > 0) {
    const file = /** @type {string} */ (pending.pop());
    if (seen.has(file)) continue;
    seen.add(file);
    const code = readFileSync(file, 'utf8');
    for (const match of code.matchAll(SPECIFIER)) {
      const specifier = match[1] ?? match[2];
      if (specifier?.startsWith('.')) pending.push(resolve(dirname(file), specifier));
    }
  }
  return [...seen].sort();
}

/** @type {string[]} */
const failures = [];
/** @type {string[]} */
const report = [];

for (const [name, route] of Object.entries(TRANSFER_ROUTES)) {
  const entryFile = resolve(ROOT, route.file);

  let files;
  try {
    files = closureOf(entryFile);
  } catch (error) {
    failures.push(
      `${name}: cannot read ${route.file} — has \`pnpm build\` run? (${error.message})`,
    );
    continue;
  }

  // Each file compressed on its own, because each is its own HTTP response.
  const served = files.reduce(
    (total, file) => total + brotliCompressSync(readFileSync(file)).length,
    0,
  );

  if (files.length !== route.requests) {
    failures.push(
      `${name}: ${files.length} requests, declared ${route.requests} — the chunk graph changed. ` +
        `Files: ${files.map((f) => relative(ROOT, f).replace(/\\/g, '/')).join(', ')}`,
    );
  }
  if (served > route.budget) {
    const over = (((served - route.measured) / route.measured) * 100).toFixed(1);
    failures.push(
      `${name}: ${served} B served, budget ${route.budget} B (declared measured ${route.measured} B, now +${over}%). ` +
        'Re-pin deliberately — measured + <= 7%, the ADR-0015 practice — or find what grew.',
    );
  }

  const drift = served - route.measured;
  report.push(
    `  ${name.padEnd(9)} ${String(files.length).padStart(2)} req  ${String(served).padStart(6)} B` +
      `  budget ${String(route.budget).padStart(6)} B` +
      (drift === 0 ? '' : `  (declared ${route.measured}, drift ${drift > 0 ? '+' : ''}${drift})`),
  );
}

if (failures.length > 0) {
  console.error('F87 violated — what a no-bundler page downloads moved:');
  for (const failure of failures) console.error(`  - ${failure}`);
  process.exit(1);
}

console.log(`F87 OK: ${Object.keys(TRANSFER_ROUTES).length} documented routes, served bytes gated`);
for (const line of report) console.log(line);
