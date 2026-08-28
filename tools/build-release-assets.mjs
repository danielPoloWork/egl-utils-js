// Roadmap 22.3 (issue #181, ADR-0087): build the release assets, and refuse to
// ship them wrong.
//
// The GitHub Release has always PROMISED artifacts — docs/workflow/release.md's
// boundary table says "Build & attach artifacts | CI" — and until 22.3 no
// workflow honoured it: release.yml built the tag to verify it compiles, then
// discarded dist/. Since npm has its own human gate (the publish dispatch) and
// dist/ is gitignored, the release assets are the one acquisition channel the
// no-bundler consumer (spec 05) has that involves no registry at all.
//
// Three files land in release-assets/ (gitignored):
//   egl-utils-js-<version>.tgz       — `npm pack`, byte-identical to what the
//                                      registry would receive
//   egl-utils-js-<version>-dist.zip  — dist/** plus LICENSE under one
//                                      version-stamped folder, for the consumer
//                                      who unzips beside an HTML page
//   SHA256SUMS                       — sha256sum(1) format, both files
//
// The gate half runs wherever the build half does — in the PR packaging job,
// not only at tag time (ADR-0082: a gate nothing invokes is not a gate):
//   1. the zip's dist/** file set EQUALS the tarball's dist/** file set — one
//      derivation of "what ships", no second truth to drift;
//   2. every path package.json advertises (the CDN fields, the artifact's
//      sourcemap, every exports-map target) is present in BOTH archives;
//   3. the zip carries LICENSE (MIT: the text travels with the files) and
//      contains nothing outside its version-stamped root.
import { execFileSync, execSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  copyFileSync,
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { advertisedPaths } from './advertised-paths.mjs';
import { distParity, normalizeArchiveEntries } from './release-assets-core.mjs';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const OUT = join(ROOT, 'release-assets');
const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));
const rootDir = `egl-utils-js-${pkg.version}`;
const zipName = `${rootDir}-dist.zip`;

/** @type {string[]} */
const failures = [];

/**
 * @param {boolean} condition
 * @param {string} message
 */
function check(condition, message) {
  if (!condition) failures.push(message);
}

// --- 0. Preconditions --------------------------------------------------------

if (!existsSync(join(ROOT, 'dist', 'global', 'egl-utils.global.js'))) {
  console.error('release-assets: dist/ is missing or incomplete — run `pnpm build` first.');
  process.exit(1);
}

rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });

// --- 1. The tarball: `npm pack`, the registry's own artifact ------------------

// `execSync` rather than `execFileSync` for npm only: on Windows `npm` is
// `npm.cmd`, which Node refuses to spawn directly, and passing an argument
// array through `shell: true` is deprecated. The command is a fixed string
// with nothing interpolated into it (the assert-packaged-files precedent).
const packed = JSON.parse(
  execSync('npm pack --json --pack-destination release-assets', {
    cwd: ROOT,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
  }),
);
const tgzName = String(packed[0].filename);
const tarballFiles = packed[0].files.map((/** @type {{ path: string }} */ f) => f.path);

// --- 2. The dist zip: one version-stamped folder, dist/** plus LICENSE --------

const stage = join(OUT, '.stage');
mkdirSync(join(stage, rootDir), { recursive: true });
cpSync(join(ROOT, 'dist'), join(stage, rootDir, 'dist'), { recursive: true });
copyFileSync(join(ROOT, 'LICENSE'), join(stage, rootDir, 'LICENSE'));

const zipAbs = join(OUT, zipName);
// The archiver is the OS toolchain, not a dependency (ADR-0087): `zip`(1) on
// the POSIX runners, bsdtar on Windows development machines — `tar -a` writes
// zip by file extension there, and libarchive lists it back for the gate.
if (process.platform === 'win32') {
  execFileSync('tar', ['-a', '-c', '-f', zipAbs, rootDir], { cwd: stage });
} else {
  execFileSync('zip', ['-r', '-X', '-q', zipAbs, rootDir], { cwd: stage });
}
rmSync(stage, { recursive: true, force: true });

// --- 3. The gate: what the assets say they are, they are -----------------------

const listing =
  process.platform === 'win32'
    ? execFileSync('tar', ['-t', '-f', zipAbs], { encoding: 'utf8' })
    : execFileSync('unzip', ['-Z1', zipAbs], { encoding: 'utf8' });
const { files: zipFiles, strays } = normalizeArchiveEntries(listing, rootDir);

check(
  strays.length === 0,
  `the zip contains entries outside \`${rootDir}/\`: ${strays.join(', ')}`,
);
check(
  zipFiles.includes('LICENSE'),
  'the zip does not carry LICENSE (MIT: the text travels with the files)',
);

const parity = distParity(zipFiles, tarballFiles);
for (const path of parity.missingFromZip) {
  check(false, `in the tarball, missing from the zip: \`${path}\``);
}
for (const path of parity.extraInZip) {
  check(false, `in the zip, absent from the tarball: \`${path}\``);
}

const tarballSet = new Set(tarballFiles);
const zipSet = new Set(zipFiles);
for (const { path, advertisedBy } of advertisedPaths(pkg)) {
  check(tarballSet.has(path), `${advertisedBy} names \`${path}\`, which is not in the tarball`);
  // The zip is the dist tree for a static page, not the package: an advertised
  // path OUTSIDE dist/ (today exactly `./package.json`, the exports map's
  // Node-resolution affordance) is the tarball's business alone — a <script>
  // consumer can never ask for it. This gate's own first run is what surfaced
  // the case (ADR-0087).
  if (path.startsWith('dist/')) {
    check(zipSet.has(path), `${advertisedBy} names \`${path}\`, which is not in the zip`);
  }
}

if (failures.length > 0) {
  console.error('release-assets violated (roadmap 22.3, ADR-0087):');
  for (const failure of failures) console.error(`  - ${failure}`);
  process.exit(1);
}

// --- 4. Checksums, then the receipt --------------------------------------------

/** @param {string} name @returns {string} */
const sha256 = (name) =>
  createHash('sha256')
    .update(readFileSync(join(OUT, name)))
    .digest('hex');
const sums = `${[tgzName, zipName].map((name) => `${sha256(name)}  ${name}`).join('\n')}\n`;
writeFileSync(join(OUT, 'SHA256SUMS'), sums, 'utf8');

/** @param {string} name @returns {string} */
const kb = (name) => `${(statSync(join(OUT, name)).size / 1024).toFixed(1)} kB`;
console.log(
  `release-assets OK: ${tgzName} (${kb(tgzName)}), ${zipName} (${kb(zipName)}, ` +
    `${zipFiles.length} files, dist parity with the tarball holds), SHA256SUMS — ` +
    'every advertised path present in both archives.',
);
