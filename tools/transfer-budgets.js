/**
 * What a **no-bundler page actually downloads**, per documented route — the
 * declared figures behind spec 05 F87 (roadmap 18.5).
 *
 * `tools/check-transfer-budgets.mjs` verifies every number here against the
 * built `dist/`, so nothing below is trusted: the closure is recomputed from the
 * real import graph and each file is compressed on every run.
 *
 * ## Why this is not a `.size-limit.json` row
 *
 * Spec 05 §6 originally placed these figures beside the other 100 size rows.
 * They cannot live there, and the reason is mechanical rather than aesthetic:
 * **a deep-ESM route is a set of files whose names are content hashes.** Adding
 * one comment line to `errors.js` and rebuilding renames *four of the nine*
 * chunks — measured, not assumed (ROADMAP 18.5, ADR-0061). A static row naming
 * `chunk-47ELFAOV.js` would need editing on most PRs that touch any source, and
 * a gate that must be re-pinned constantly is a gate people stop reading.
 * Keying by **entry name** — which is stable public API — and resolving the
 * closure at run time is the only shape that survives.
 *
 * ## Why it is a different number from the size-limit row for the same entry
 *
 * The two answer different questions and both are kept:
 *
 * - a **size-limit row** measures what a *bundler consumer* ships: the entry
 *   tree-shaken to the imports actually used, bundled into one file, then
 *   compressed once (NFR-01/NFR-02);
 * - a **row here** measures what a *static page* transfers: the entry file plus
 *   every chunk it transitively imports, each served and compressed as its own
 *   response, with no tree-shaking, because the browser downloads whole files.
 *
 * The served figure is therefore always the larger one, often by a lot —
 * `/index` is 6 068 B bundled and 13 461 B served — and quoting the bundled
 * number at a no-bundler consumer would understate their cost by half.
 *
 * ## The metric
 *
 * Brotli at Node's default quality, each file compressed **separately**, summed
 * — because that is what a CDN does with independent responses. The existing
 * size rows are also brotli (see ADR-0059 on NFR-22's loose "min+gzip"
 * wording), so the two accountings stay comparable.
 *
 * ## Expect two rows to move on every version bump
 *
 * `root` and `artifact` are the routes that carry the `VERSION` string, and
 * brotli is sensitive enough that changing `1.0.0` to `1.1.0` moved them by
 * −12 B and −98 B respectively — the other nine were byte-identical. That is
 * real, it is not noise to suppress, and it is why the check prints the drift
 * on every run: re-baselining these two at each release is reading one line,
 * and the alternative is a permanent drift note people learn to scroll past.
 *
 * @module tools/transfer-budgets
 */

/**
 * @typedef {object} TransferRoute
 * @property {string} file - Path under `dist/`, relative to the package root.
 *   For a deep-ESM entry this is the file a page imports; its chunk closure is
 *   resolved from it.
 * @property {number} requests - Exact number of files the page fetches for this
 *   route — the entry plus its transitive chunks, or 1 for the artifact. Gated
 *   exactly rather than as a ceiling: a build change that splits or merges a
 *   chunk changes the round-trip count on a high-latency connection even when
 *   the byte total holds, and that deserves a deliberate look rather than a
 *   silent pass.
 * @property {number} measured - Served bytes at the last re-pin: every file in
 *   the closure brotli-compressed on its own, summed.
 * @property {number} budget - The gate. Measured + ≤ 7%, the ADR-0015 practice.
 * @property {string} [why] - Anything a reader would otherwise have to derive.
 */

/**
 * Every route the README's "Use from a browser, without npm" section documents
 * (spec 05 F85), in the order that section presents them.
 *
 * @type {Record<string, TransferRoute>}
 */
export const TRANSFER_ROUTES = {
  // --- The deep-ESM route, one row per entry (F85's per-entry URLs) ---------
  index: { file: 'dist/esm/index.js', requests: 7, measured: 13449, budget: 14400 },
  storage: { file: 'dist/esm/storage.js', requests: 4, measured: 4246, budget: 4540 },
  sanitize: {
    file: 'dist/esm/sanitize.js',
    requests: 3,
    measured: 2914,
    budget: 3110,
    why: 'DOMPurify is looked up, never imported (ADR-0055), so the peer costs this route nothing until the page loads it itself.',
  },
  errors: { file: 'dist/esm/errors.js', requests: 2, measured: 1074, budget: 1140 },
  text: { file: 'dist/esm/text.js', requests: 3, measured: 1674, budget: 1790 },
  net: { file: 'dist/esm/net.js', requests: 2, measured: 1340, budget: 1430 },
  table: {
    file: 'dist/esm/table.js',
    requests: 4,
    measured: 8461,
    budget: 8968,
    why: '+1710 B for remotePipeline (spec 06 F88-F91, roadmap 19.1). A bundler consumer who does not import it pays nothing - the {tablePipeline} size row is unchanged - but this route downloads whole files, which is the trade the deep-ESM route makes.',
  },
  logging: { file: 'dist/esm/logging.js', requests: 3, measured: 3063, budget: 3270 },
  dom: { file: 'dist/esm/dom.js', requests: 7, measured: 10849, budget: 11600 },
  bootstrap: {
    file: 'dist/esm/bootstrap.js',
    requests: 7,
    measured: 32979,
    budget: 34957,
    why:
      'The whole catalogue over 7 requests — now MORE than the single-file artifact over 1, so a page needing ' +
      '/bootstrap should take the artifact. It grew +1703 B in 19.1 without gaining a feature: bsTable pulls the ' +
      'table chunk, and that chunk now carries remotePipeline. A bundler shakes it away; this route downloads whole ' +
      'files, which is exactly the cost F87 exists to keep visible instead of silent.',
  },

  // --- The artifact route (F83) --------------------------------------------
  artifact: {
    file: 'dist/global/egl-utils.global.js',
    requests: 1,
    measured: 32706,
    budget: 33600,
    why: 'Budget is NFR-22 as pinned by ADR-0059. The size-limit row for the same file reports 31 444 B because it re-bundles through esbuild first; this figure is the file served as-is, which is what a CDN sends.',
  },
};
