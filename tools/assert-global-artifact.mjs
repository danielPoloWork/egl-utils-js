// Spec 05 F83 gate: the global single-file artifact must expose the WHOLE public
// surface as the single global `egl`, with nothing renamed, nothing missing, and
// no side effect beyond defining that global (roadmap 18.2).
//
// The artifact's surface is composed by `export *` (src/main/.../global.js), so
// it cannot drift by omission the way a hand-written object literal would. What
// it can still do is drift by *construction* — a bundler that inlines a peer, a
// sub-namespace name that starts colliding with a root export, a build config
// that stops minifying or stops emitting the sourcemap. Those are the failures
// this gate names, and it names them against the built file rather than the
// source, because the built file is what a CDN serves.
//
// The artifact is evaluated in a `vm` context furnished with a jsdom window, so
// "defines exactly one global" is measured rather than asserted: the context's
// own property set is diffed before and after.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createContext, runInContext } from 'node:vm';
import { JSDOM } from 'jsdom';

const ROOT = new URL('../', import.meta.url);
const ARTIFACT = fileURLToPath(new URL('dist/global/egl-utils.global.js', ROOT));
const SOURCE_DIR = new URL('src/main/javascript/it/d4np/utils/', ROOT);

/** The ten subpaths, each a sub-namespace on `egl` named after its exports path. */
const SUBPATHS = [
  'storage',
  'sanitize',
  'errors',
  'text',
  'net',
  'table',
  'logging',
  'dom',
  'bootstrap',
  'ui',
  'forms',
];

/** @type {string[]} */
const failures = [];

/**
 * @param {boolean} condition
 * @param {string} message
 */
function check(condition, message) {
  if (!condition) failures.push(message);
}

// --- 1. The file itself -----------------------------------------------------

const code = readFileSync(ARTIFACT, 'utf8');

const lines = code.split('\n');
check(/\bvar egl\s*=/.test(lines[0]), 'the artifact does not open by defining `egl`');
// A build that quietly stopped minifying would still define `egl` and still pass
// every other check here, so the property gets its own assertion. Average line
// length, not line count: esbuild's minified output is a handful of very long
// lines rather than literally one, and readable source averages tens of chars.
const averageLineLength = Math.round(code.length / lines.length);
check(
  averageLineLength > 500,
  `the artifact does not look minified (${lines.length} lines averaging ${averageLineLength} chars)`,
);
check(
  code.includes('//# sourceMappingURL=egl-utils.global.js.map'),
  'the artifact does not reference its sourcemap',
);
// A classic <script> has no module resolution: a bare specifier that survived
// bundling would be a runtime ReferenceError on the consumer's page, and the
// peers are supposed to be looked up at use (ADR-0041, ADR-0055), never bundled.
for (const peer of ['bootstrap', '@popperjs/core', 'dompurify']) {
  check(
    !new RegExp(`(?:require|import)\\s*\\(?\\s*["']${peer.replace('/', '\\/')}["']`).test(code),
    `the artifact references the peer '${peer}' — peers stay external (F83)`,
  );
}

// --- 2. Loading it defines `egl`, and nothing else ---------------------------

const { window } = new JSDOM('<!doctype html><body></body>');
const context = createContext({ window, document: window.document, console });
const before = new Set(Object.getOwnPropertyNames(context));
runInContext(code, context);
const defined = Object.getOwnPropertyNames(context).filter((name) => !before.has(name));

check(
  defined.length === 1 && defined[0] === 'egl',
  `loading the artifact must define exactly \`egl\`, it defined: ${defined.join(', ') || '(nothing)'}`,
);

const egl = /** @type {Record<string, unknown>} */ (context.egl);
check(egl !== undefined && egl !== null, 'the artifact did not produce an `egl` namespace');

// --- 3. The surface matches the eleven entries, nothing renamed -------------

const entryNames = async () => {
  /** @type {Record<string, string[]>} */
  const surface = {};
  const root = await import(new URL('index.js', SOURCE_DIR).href);
  surface['.'] = Object.keys(root).sort();
  for (const subpath of SUBPATHS) {
    const module = await import(new URL(`${subpath}.js`, SOURCE_DIR).href);
    surface[subpath] = Object.keys(module).sort();
  }
  return surface;
};

const surface = await entryNames();

// The root entry, flattened onto `egl` itself.
const missingRoot = surface['.'].filter((name) => !(name in egl));
check(missingRoot.length === 0, `root exports missing from \`egl\`: ${missingRoot.join(', ')}`);

// A sub-namespace whose name collides with a root export would shadow one of the
// two silently, which is why this is a gate and not a comment.
const collisions = SUBPATHS.filter((subpath) => surface['.'].includes(subpath));
check(
  collisions.length === 0,
  `sub-namespace name(s) collide with a root export: ${collisions.join(', ')}`,
);

for (const subpath of SUBPATHS) {
  const namespace = /** @type {Record<string, unknown> | undefined} */ (
    /** @type {any} */ (egl)[subpath]
  );
  if (namespace === undefined) {
    failures.push(`\`egl.${subpath}\` is missing`);
    continue;
  }
  const missing = surface[subpath].filter((name) => !(name in namespace));
  check(missing.length === 0, `exports missing from \`egl.${subpath}\`: ${missing.join(', ')}`);
}

// --- 4. Version lockstep, by construction (F83, ADR-0018) -------------------

const pkg = JSON.parse(readFileSync(fileURLToPath(new URL('package.json', ROOT)), 'utf8'));
check(
  egl?.VERSION === pkg.version,
  `\`egl.VERSION\` is ${JSON.stringify(egl?.VERSION)}, package.json says ${JSON.stringify(pkg.version)}`,
);

// --- Report -----------------------------------------------------------------

if (failures.length > 0) {
  console.error('F83 violated by dist/global/egl-utils.global.js:');
  for (const failure of failures) console.error(`  - ${failure}`);
  process.exit(1);
}

const total =
  surface['.'].length + SUBPATHS.reduce((sum, subpath) => sum + surface[subpath].length, 0);
console.log(
  `F83 OK: \`egl\` exposes ${surface['.'].length} root exports and ${SUBPATHS.length} ` +
    `sub-namespaces (${total} bindings), defines no other global, bundles no peer, ` +
    `and reports VERSION ${pkg.version}`,
);
