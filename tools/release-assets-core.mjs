// The pure half of build-release-assets.mjs, split out so its logic is TESTED
// (src/test/javascript/it/d4np/utils/release-assets-tools.test.js) — the 19.8
// discipline: a gate whose logic only ever runs inside the gate is the next
// blind spot (ADR-0064, ADR-0082).

/**
 * Normalize an archive listing (`unzip -Z1` on POSIX, `tar -tf` under bsdtar
 * on Windows: one entry per line, directories with a trailing slash) into the
 * file paths under `rootDir/`. Anything NOT under `rootDir/` is a stray — a
 * packaging bug the caller must refuse, because the zip's contract is "one
 * version-stamped folder and nothing beside it".
 *
 * @param {string} listing raw archiver stdout
 * @param {string} rootDir the version-stamped folder every entry must sit under
 * @returns {{ files: string[], strays: string[] }} `files` are `rootDir/`-relative
 */
export function normalizeArchiveEntries(listing, rootDir) {
  const prefix = `${rootDir}/`;
  /** @type {string[]} */
  const files = [];
  /** @type {string[]} */
  const strays = [];
  for (const raw of listing.split('\n')) {
    const entry = raw.replace(/\r$/, ''); // only CR — trimming more could mask a bad name
    if (entry === '' || entry === rootDir || entry === prefix) continue;
    if (!entry.startsWith(prefix)) {
      strays.push(entry);
      continue;
    }
    if (entry.endsWith('/')) continue; // a directory entry, not a file
    files.push(entry.slice(prefix.length));
  }
  return { files, strays };
}

/**
 * Set parity between the zip's `dist/**` and the tarball's `dist/**` — one
 * derivation of "what ships", so there is no second truth to drift. Entries
 * outside `dist/` (LICENSE in the zip; package.json/README.md in the tarball)
 * are each archive's own business and are deliberately not compared.
 *
 * @param {string[]} zipFiles rootDir-relative zip entries
 * @param {string[]} tarballFiles tarball entries as `npm pack --json` reports them
 * @returns {{ missingFromZip: string[], extraInZip: string[] }} both sorted
 */
export function distParity(zipFiles, tarballFiles) {
  const isDist = (/** @type {string} */ path) => path.startsWith('dist/');
  const zip = new Set(zipFiles.filter(isDist));
  const tarball = new Set(tarballFiles.filter(isDist));
  return {
    missingFromZip: [...tarball].filter((path) => !zip.has(path)).sort(),
    extraInZip: [...zip].filter((path) => !tarball.has(path)).sort(),
  };
}
