// Version propagation and lockstep check (roadmap 7.4, ADR-0016).
//
// WHY THIS EXISTS. `changeset version` bumps `package.json` and nothing else,
// but this repository's version lives in four more places that
// tools/consistency_lint.py holds in lockstep: `version.js`'s VERSION
// constant, the README `Status-vX.Y.Z` badge, the per-version changelog file,
// and the release-notes file. The lint compares those four against each
// other — it never reads `package.json`. So adopting changesets without this
// tool would create two sources of truth whose divergence the existing gate
// could not see: package.json at 0.1.0, everything else still 0.0.0, lint
// green.
//
// `--check` closes that gap as a CI gate. The default mode propagates
// package.json's version into the files changesets does not touch, and is what
// `pnpm changeset:version` runs.
//
// The changelog and release-notes files are deliberately NOT created here:
// they need prose a human writes, and generating empty ones to satisfy a lint
// would be exactly the box-ticking this project avoids.
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const check = process.argv.includes('--check');

/** @param {string} relative @returns {string} */
const read = (relative) => readFileSync(resolve(ROOT, relative), 'utf8');

const pkgVersion = JSON.parse(read('package.json')).version;
if (typeof pkgVersion !== 'string' || !/^\d+\.\d+\.\d+/.test(pkgVersion)) {
  console.error(`sync-version: package.json version is not a SemVer string: ${pkgVersion}`);
  process.exit(1);
}

/**
 * Each target: where the version lives, how to find it, how to rewrite it.
 * @type {{ file: string, pattern: RegExp, replace: (version: string) => string, label: string }[]}
 */
const TARGETS = [
  {
    file: 'src/main/javascript/it/d4np/utils/version.js',
    pattern: /export const VERSION = '(\d+\.\d+\.\d+[^']*)'/,
    replace: (version) => `export const VERSION = '${version}'`,
    label: 'VERSION constant',
  },
  {
    file: 'README.md',
    pattern: /Status-v(\d+\.\d+\.\d+[^-]*)-/,
    replace: (version) => `Status-v${version}-`,
    label: 'README status badge',
  },
];

/** @type {string[]} */
const problems = [];
/** @type {string[]} */
const updated = [];

// README pinned examples (roadmap 22.3, ADR-0087). The CDN snippets and the
// release-asset filenames pin a concrete version so they are copy-pasteable —
// and a pin is data, so a stale one is the ADR-0082 failure mode. The release
// flow rewrites every one of them here; tools/consistency_lint.py verifies
// them, which is what makes the convention mechanical rather than a habit.
const PIN = /egl-utils-js([@-])(\d+\.\d+\.\d+)/g;
{
  const file = 'README.md';
  const text = read(file);
  const stale = [...text.matchAll(PIN)].filter((m) => m[2] !== pkgVersion);
  if (stale.length > 0) {
    if (check) {
      const versions = [...new Set(stale.map((m) => m[2]))].join(', ');
      problems.push(
        `${file}: ${stale.length} pinned example(s) at v${versions} but package.json is v${pkgVersion}`,
      );
    } else {
      writeFileSync(
        resolve(ROOT, file),
        text.replace(PIN, (_all, sep) => `egl-utils-js${sep}${pkgVersion}`),
        'utf8',
      );
      updated.push(`${file} (pinned examples): ${stale.length} pin(s) -> v${pkgVersion}`);
    }
  }
}

for (const target of TARGETS) {
  const text = read(target.file);
  const match = text.match(target.pattern);
  if (match === null) {
    problems.push(`${target.file}: could not locate the ${target.label}`);
    continue;
  }
  if (match[1] === pkgVersion) continue;

  if (check) {
    problems.push(
      `${target.file}: ${target.label} is v${match[1]} but package.json is v${pkgVersion}`,
    );
  } else {
    writeFileSync(
      resolve(ROOT, target.file),
      text.replace(target.pattern, target.replace(pkgVersion)),
      'utf8',
    );
    updated.push(`${target.file} (${target.label}): v${match[1]} -> v${pkgVersion}`);
  }
}

if (problems.length > 0) {
  console.error(`sync-version: version is not in lockstep with package.json (v${pkgVersion}):`);
  for (const problem of problems) console.error(`  ✗ ${problem}`);
  console.error(
    check
      ? '\nRun `node tools/sync-version.mjs` to propagate, then commit the result.'
      : '\nFix the files above by hand — the expected pattern was not found.',
  );
  process.exit(1);
}

if (check) {
  console.log(`sync-version OK: every version site matches package.json (v${pkgVersion}).`);
} else if (updated.length === 0) {
  console.log(`sync-version: already in lockstep at v${pkgVersion}, nothing to do.`);
} else {
  console.log(`sync-version: propagated package.json v${pkgVersion}:`);
  for (const line of updated) console.log(`  · ${line}`);
  console.log(
    '\nStill needed by hand for a release: docs/changelog/v<MAJOR>/v' +
      `${pkgVersion}.md and docs/releases/v${pkgVersion}.md (prose, not generated).`,
  );
}
