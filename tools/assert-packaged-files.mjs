// Spec 05 F84 / NFR-23 gate: every path the package *advertises* must be a file
// the package actually *ships* (roadmap 18.3).
//
// The two are set independently — `files` decides what is packed, while
// `exports`, `unpkg` and `jsdelivr` decide what consumers ask for — and nothing
// checks them against each other. `publint` reads the manifest and the working
// tree; this gate reads the **packed tarball's own file list**, which is the
// only thing a consumer or a CDN can see. Narrow `files` by one entry and the
// bare CDN URL starts 404-ing while every other gate stays green.
//
// It also pins the one property that makes the CDN fields *correct* rather than
// merely present: they must name the IIFE artifact, because the URL they answer
// is fetched by a classic `<script src>` with no `type="module"`, and an ESM
// file in that position is a syntax error on the consumer's page, not a
// fallback.
import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { advertisedPaths, exportsTargets, normalizePath } from './advertised-paths.mjs';

const ROOT = new URL('../', import.meta.url);
const pkg = JSON.parse(readFileSync(fileURLToPath(new URL('package.json', ROOT)), 'utf8'));

/** @type {string[]} */
const failures = [];

/**
 * @param {boolean} condition
 * @param {string} message
 */
function check(condition, message) {
  if (!condition) failures.push(message);
}

// --- What the tarball actually contains -------------------------------------

// `npm pack --dry-run` writes nothing and reports the exact entry list the
// registry would receive, `files` and the default inclusions already applied.
const packed = JSON.parse(
  // `execSync` rather than `execFileSync`: on Windows `npm` is `npm.cmd`, which
  // Node refuses to spawn directly, and passing an argument array through
  // `shell: true` is deprecated. The command is a fixed string with nothing
  // interpolated into it, so routing it through a shell adds no injection
  // surface.
  execSync('npm pack --dry-run --json', {
    cwd: fileURLToPath(ROOT),
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
  }),
);
const shipped = new Set(packed[0].files.map((/** @type {{path: string}} */ f) => f.path));

/**
 * @param {string} target
 * @param {string} advertisedBy
 */
function mustShip(target, advertisedBy) {
  check(
    shipped.has(normalizePath(target)),
    `${advertisedBy} names \`${target}\`, which is not packed`,
  );
}

// --- 1. The CDN fields (F84) ------------------------------------------------

const { unpkg, jsdelivr } = pkg;
check(typeof unpkg === 'string', 'package.json has no `unpkg` field');
check(typeof jsdelivr === 'string', 'package.json has no `jsdelivr` field');
// One CDN default, not two: the bare package URL must mean the same thing on
// either service, or the documentation in 18.4 has to fork per CDN.
check(unpkg === jsdelivr, `\`unpkg\` (${unpkg}) and \`jsdelivr\` (${jsdelivr}) disagree`);

if (typeof unpkg === 'string') {
  // The reason the fields point at the artifact and not at dist/esm/index.js.
  check(
    unpkg.endsWith('.global.js'),
    `\`unpkg\` names \`${unpkg}\`, which is not the IIFE artifact — a bare CDN URL is ` +
      'fetched by a classic <script src>, where an ESM file is a syntax error',
  );
}

// --- 2. Every advertised path (F84 + NFR-23) ---------------------------------

// One derivation of "advertised", shared with the release-asset gate
// (build-release-assets.mjs) so the tarball and the release zip can never be
// held to two different lists (roadmap 22.3, ADR-0087). Covers the CDN fields,
// the artifact's sourcemap, and every exports-map target.
for (const { path, advertisedBy } of advertisedPaths(pkg)) {
  mustShip(path, advertisedBy);
}

// --- 3. The fields this package deliberately does NOT declare ---------------

// `main`, `module` and `browser` are resolution fields that pre-date the
// exports map and that bundlers still honour. Declaring any of them would give
// a second, unversioned answer to "what is this package" beside the map that is
// supposed to be the only one — and `browser` in particular would redirect
// bundler consumers onto the IIFE. NFR-23 promises a bundler consumer changes
// nothing across this wave; that promise is this assertion.
for (const field of ['main', 'module', 'browser']) {
  check(
    !(field in pkg),
    `package.json declares \`${field}\` — the exports map is the only resolution surface (NFR-23)`,
  );
}

// --- Report -----------------------------------------------------------------

if (failures.length > 0) {
  console.error('F84/NFR-23 violated:');
  for (const failure of failures) console.error(`  - ${failure}`);
  process.exit(1);
}

console.log(
  `F84 OK: ${shipped.size} files packed; the CDN default \`${unpkg}\` and all ` +
    `${new Set(exportsTargets(pkg.exports)).size} exports-map targets are among them, ` +
    'and no main/module/browser field competes with the map',
);
