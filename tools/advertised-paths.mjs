// The paths `package.json` ADVERTISES — the CDN fields, the artifact's
// sourcemap, and every exports-map target. Shared by the F84 packed-tarball
// gate (assert-packaged-files.mjs) and the release-asset gate
// (build-release-assets.mjs), so the two can never drift apart on what
// "advertised" means (roadmap 22.3, ADR-0087).

/**
 * `"./dist/x.js"` and `"dist/x.js"` are the same file to a tarball or a zip.
 *
 * @param {string} path
 * @returns {string}
 */
export const normalizePath = (path) => path.replace(/^\.\//, '');

/**
 * Collect the string leaves of the exports map — each one a file a consumer
 * can reach through some condition.
 *
 * @param {unknown} node
 * @returns {string[]}
 */
export function exportsTargets(node) {
  if (typeof node === 'string') return [node];
  if (node === null || typeof node !== 'object') return [];
  return Object.values(node).flatMap(exportsTargets);
}

/**
 * Every advertised path, paired with the field that advertises it — the pair
 * is what lets a caller report failures by advertiser rather than as a bare
 * file list. The CDN fields are listed individually (their mutual agreement is
 * a rule the F84 gate owns); exports-map targets are deduplicated among
 * themselves.
 *
 * @param {{ unpkg?: unknown, jsdelivr?: unknown, exports?: unknown }} pkg
 * @returns {{ path: string, advertisedBy: string }[]}
 */
export function advertisedPaths(pkg) {
  /** @type {{ path: string, advertisedBy: string }[]} */
  const pairs = [];
  if (typeof pkg.unpkg === 'string') {
    pairs.push({ path: normalizePath(pkg.unpkg), advertisedBy: '`unpkg`' });
    // A `sourceMappingURL` that 404s is a papercut every consumer's devtools
    // reports, so the map is advertised wherever the artifact is.
    pairs.push({
      path: normalizePath(`${pkg.unpkg}.map`),
      advertisedBy: "the artifact's `sourceMappingURL`",
    });
  }
  if (typeof pkg.jsdelivr === 'string') {
    pairs.push({ path: normalizePath(pkg.jsdelivr), advertisedBy: '`jsdelivr`' });
  }
  for (const target of new Set(exportsTargets(pkg.exports))) {
    pairs.push({ path: normalizePath(target), advertisedBy: '`exports`' });
  }
  return pairs;
}
