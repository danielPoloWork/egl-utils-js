// NFR-07 platform-API floor gate (roadmap 8.1, ADR-0017).
//
// WHY THIS EXISTS, AND WHY IT IS NOT eslint-plugin-compat.
//
// The roadmap 7.6 review found `AbortSignal.timeout` (Safari 16.0) called
// unconditionally against a declared Safari 15.4 floor — two public functions
// broken on a promised browser, undetected for six milestones. Playwright
// cannot catch that class of defect: it runs one recent build per engine, never
// an old Safari.
//
// eslint-plugin-compat was the obvious candidate and was tried first. With a
// correct browserslist resolving to 34 targets including safari 15.4, and the
// file confirmed linted (1 file, 0 messages, 0 suppressed), it reported nothing
// for `AbortSignal.timeout`, `Object.groupBy`, `checkVisibility`,
// `ResizeObserver` or `navigator.clipboard`. Its rule coverage simply does not
// include them. Adopting it would have produced a green gate that checks
// nothing — the same false-confidence failure ADR-0014 rejected when vitest's
// `rme` looked like a noise estimate but measured the wrong noise.
//
// The DATA, however, is authoritative and machine-readable:
// `@mdn/browser-compat-data` records `api.AbortSignal.timeout_static` →
// safari 16, and `api.structuredClone` → safari 15.4. So this gate uses BCD
// directly and adds the part a linter cannot: a DENY-BY-DEFAULT inventory, so a
// newly introduced platform API fails until someone records how it is reached.
//
// Three checks, all of which must pass:
//   1. every inventory entry resolves to a real BCD path (a typo fails);
//   2. every entry whose floor is newer than the support matrix is `guarded`,
//      and every `guarded` entry is actually needed (a stale guard fails too);
//   3. every platform global referenced in src/main is in the inventory.
import { createRequire } from 'node:module';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { GLOBALS, MEMBERS, SUPPORT_MATRIX } from './api-floor-inventory.js';
import { codeOf, platformUses, POLICED } from './api-floor-scan.js';

// BCD's ESM entry re-exports data.json without an import attribute, which Node
// refuses; `require` sidesteps it and also works on the Node 18 floor, where
// import attributes do not exist at all.
const bcd = createRequire(import.meta.url)('@mdn/browser-compat-data');

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const SOURCE_DIR = resolve(ROOT, 'src/main/javascript/it/d4np/utils');

/** @param {string} dir @returns {string[]} */
function jsFiles(dir) {
  return readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) return jsFiles(full);
    return full.endsWith('.js') ? [full] : [];
  });
}

/** Resolve a dot path such as `api.AbortSignal.timeout_static` inside BCD. */
function lookup(path) {
  let node = /** @type {any} */ (bcd);
  for (const key of path.split('.')) {
    node = node?.[key];
    if (node === undefined) return undefined;
  }
  return node?.__compat?.support;
}

/**
 * The earliest version that supports the feature, as a string, or `null` when
 * BCD reports no support. BCD may give an array of ranges; the *current*
 * support entry is the one without `version_removed`.
 */
function floorFor(support, browser) {
  const raw = support?.[browser];
  if (raw === undefined) return null;
  const entries = Array.isArray(raw) ? raw : [raw];
  const current = entries.find((entry) => entry.version_removed === undefined) ?? entries[0];
  const added = current?.version_added;
  if (added === false || added === null || added === undefined) return null;
  return added === true ? '0' : String(added).replace(/^≤/, '');
}

/** Numeric compare of dotted versions; missing parts count as 0. */
function gt(a, b) {
  const pa = String(a).split('.').map(Number);
  const pb = String(b).split('.').map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i += 1) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (d !== 0) return d > 0;
  }
  return false;
}

/** @type {string[]} */
const failures = [];
/** @type {string[]} */
const notes = [];

// --- checks 1 and 2 -------------------------------------------------------
for (const [name, entry] of [...Object.entries(GLOBALS), ...Object.entries(MEMBERS)]) {
  const support = lookup(entry.bcd);
  if (support === undefined) {
    failures.push(`  ✗ ${name}: BCD path \`${entry.bcd}\` does not resolve — fix the inventory`);
    continue;
  }

  /** @type {string[]} */
  const exceeded = [];
  for (const [browser, minimum] of Object.entries(SUPPORT_MATRIX)) {
    const floor = floorFor(support, browser);
    if (floor === null) {
      exceeded.push(`${browser}: unsupported`);
    } else if (gt(floor, minimum)) {
      exceeded.push(`${browser} ${floor} > ${minimum}`);
    }
  }

  if (entry.guarded !== undefined && entry.guardReason === undefined) {
    failures.push(
      `  ✗ ${name}: is \`guarded\` but does not say why — set guardReason to 'version' or 'context'`,
    );
  }

  if (exceeded.length > 0 && entry.guarded === undefined) {
    failures.push(
      `  ✗ ${name}: floor exceeds the support matrix (${exceeded.join('; ')}) and is NOT guarded.\n` +
        `      Either add a fallback and record it as \`guarded\`, or raise NFR-07's floor deliberately.`,
    );
  } else if (exceeded.length > 0) {
    notes.push(`  · ${name}: ${exceeded.join('; ')} — guarded: ${entry.guarded}`);
  } else if (entry.guarded !== undefined && entry.guardReason === 'context') {
    // Guarded for a reason BCD cannot express as a version (secure context, a
    // DOM being present). Never stale on version grounds.
    notes.push(`  · ${name}: within the matrix, guarded for context — ${entry.guarded}`);
  } else if (entry.guarded !== undefined) {
    // A VERSION guard whose floor has caught up is either dead code or a wrong
    // reason in the inventory. Worth knowing; not a failure.
    notes.push(
      `  ! ${name}: marked guarded (version) but its BCD floor is now within the matrix — ` +
        're-check whether the fallback is still needed',
    );
  } else {
    notes.push(`  ✓ ${name}: within the matrix unguarded`);
  }
}

// --- check 3: deny-by-default over the source ----------------------------
const KNOWN_GLOBALS = new Set(Object.keys(GLOBALS));
const KNOWN_MEMBERS = new Set(Object.keys(MEMBERS));

// The scan itself — the tokenizer, the POLICED list and the four reference
// shapes — lives in ./api-floor-scan.js, which is pure and therefore testable.
// It was split out by roadmap 19.8 after two evasions were found by removing an
// inventory entry and watching this gate stay green: a member read inside a
// template literal, and one behind optional chaining. `api-floor-scanner.test.js`
// now asserts each shape is seen, because a regex fixed without a test is only
// the next blind spot (ADR-0064).
const WHAT_TO_ADD = 'Add it to tools/api-floor-inventory.js with its BCD path (deny-by-default).';

for (const file of jsFiles(SOURCE_DIR)) {
  const code = codeOf(readFileSync(file, 'utf8'));
  const short = file.slice(ROOT.length + 1).replace(/\\/g, '/');

  for (const use of platformUses(code, POLICED)) {
    if (use.kind === 'member') {
      // Storage members are inventoried under one representative key: the
      // availability question is the storage object, not each method.
      const normalized =
        use.global === 'localStorage' || use.global === 'sessionStorage'
          ? `${use.global}.getItem`
          : use.name;
      // A GLOBALS entry authorizes reading the global itself, never its members:
      // `document` being declared says nothing about whether `document.fooBar`
      // exists at the floor. Consulting KNOWN_GLOBALS here would have let one
      // bare-global entry blanket-authorize every member reached off it.
      if (!KNOWN_MEMBERS.has(normalized)) {
        failures.push(`  ✗ ${short}: uses \`${use.name}\` — not in the inventory. ${WHAT_TO_ADD}`);
      }
      continue;
    }

    if (use.kind === 'computed') {
      // A computed key is unresolvable by a scanner, so it is refused rather than
      // waved through — the alternative is an evasion one bracket wide. Dot
      // access, or an explicit inventory entry for the global, is the way past.
      if (!KNOWN_GLOBALS.has(use.global) && !KNOWN_MEMBERS.has(use.global)) {
        failures.push(
          `  ✗ ${short}: reaches \`${use.global}\` through a computed key, which this gate ` +
            `cannot resolve. Use dot access so the member is scannable, or inventory the global. ` +
            WHAT_TO_ADD,
        );
      }
      continue;
    }

    if (!KNOWN_GLOBALS.has(use.global) && !KNOWN_MEMBERS.has(use.global)) {
      const how =
        use.kind === 'bare' ? `calls \`${use.global}()\`` : `references \`${use.global}\``;
      failures.push(`  ✗ ${short}: ${how} — not in the inventory. ${WHAT_TO_ADD}`);
    }
  }
}

const unique = [...new Set(failures)];

console.log(
  `NFR-07 platform-API floor gate — matrix: ${Object.entries(SUPPORT_MATRIX)
    .map(([b, v]) => `${b} >= ${v}`)
    .join(', ')} (floors from @mdn/browser-compat-data ${bcd.__meta?.version ?? ''})`,
);
for (const note of notes.sort()) console.log(note);

if (unique.length > 0) {
  console.error(`\n${unique.length} problem(s):`);
  for (const failure of unique) console.error(failure);
  process.exit(1);
}

console.log(
  `\nAll ${Object.keys(GLOBALS).length + Object.keys(MEMBERS).length} inventoried APIs are within the matrix or guarded, and no un-inventoried platform API is used.`,
);
