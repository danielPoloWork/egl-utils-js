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
  index: { file: 'dist/esm/index.js', requests: 7, measured: 13574, budget: 14400 },
  storage: {
    file: 'dist/esm/storage.js',
    requests: 5,
    measured: 4503,
    budget: 4820,
    why: '+161 B and a FIFTH request in 20.3, for a wave that added nothing to this entry: the F106 theme manager persists through the F21 wrapper, so /ui became a consumer of this entry and esbuild re-split the chunk they now share. A bundler consumer of /storage saw 3 B of that (the size row); a static page sees a round trip.',
  },
  sanitize: {
    file: 'dist/esm/sanitize.js',
    requests: 3,
    measured: 3012,
    budget: 3110,
    why: 'DOMPurify is looked up, never imported (ADR-0055), so the peer costs this route nothing until the page loads it itself.',
  },
  errors: {
    file: 'dist/esm/errors.js',
    requests: 2,
    measured: 1178,
    budget: 1260,
    why: '+104 B in 19.4 for ClipboardError and its reason vocabulary (spec 06 F97, ADR-0066). Eleven classes over two requests; a route this small moves in percentage terms on any addition, which is why the figure and not the percentage is the thing to read.',
  },
  text: { file: 'dist/esm/text.js', requests: 3, measured: 1674, budget: 1790 },
  net: { file: 'dist/esm/net.js', requests: 2, measured: 1340, budget: 1430 },
  table: {
    file: 'dist/esm/table.js',
    requests: 5,
    measured: 11821,
    budget: 12600,
    why: "+1170 B in 19.3 for the F94 selection model, on top of 19.2's state pair and 19.1's remotePipeline — three siblings behind one entry, and this route pays for the whole file each lives in. That is the trade the deep-ESM route makes, and the reason F87 counts served bytes rather than imported ones: a bundler consumer pays the 1433 B tableSelection size row, and only if they import it.",
  },
  logging: { file: 'dist/esm/logging.js', requests: 3, measured: 3063, budget: 3270 },
  dom: {
    file: 'dist/esm/dom.js',
    requests: 12,
    measured: 17154,
    budget: 18300,
    why: '+735 B and TWO more requests in 21.1 (a TWELFTH file), and this entry gained 108 B of source: the F113 `getValue` read primitive went here rather than into /forms, so a page that wants to read one control pays 280 B of bundled code — while a static page pays for two extra round trips it did not ask for, because a twelfth entry re-split the shared chunks. That gap between 108 B and 735 B is the whole reason F87 measures both. Before that: +924 B and a TENTH request in 20.6, for the F111 reduced-motion helper (291 B on its own) plus the chunk re-split around it. +524 B and a NINTH request in 20.1, for a wave that added nothing to this entry: the new /ui entry became an eleventh consumer of the shared chunks and esbuild re-split them, so a deep-ESM /dom page now fetches one more file. This is the cost F87 exists to keep visible - a bundler consumer sees 2 B of it (the size-limit row), a static page sees 524 B and a round trip. Before 20.1: +2683 B and an eighth request for bindTableHistory (spec 06 F93, roadmap 19.2, ADR-0063) and the F92 pair it composes.',
  },
  bootstrap: {
    file: 'dist/esm/bootstrap.js',
    requests: 12,
    measured: 44991,
    budget: 47500,
    why:
      'The whole catalogue over 8 requests — still MORE than the single-file artifact over 1, so a page needing ' +
      '/bootstrap should take the artifact. 19.3 is the first M19 item to grow it for a feature it actually ' +
      'gained: bsTable renders the F95 selection column. 19.1 and 19.2 grew it for features it did not, because ' +
      'bsTable pulls the shared table chunk and that chunk carries remotePipeline and the F92 pair too. A bundler ' +
      'shakes those away; this route downloads whole files, which is exactly the cost F87 exists to keep visible ' +
      'instead of silent. ' +
      'Re-pinned for 20.1 at measured + 6.1%, the ordinary ADR-0015 practice — which applies here and does NOT apply ' +
      'to the artifact row below, because this route answers to no spec ceiling and that one answers to NFR-22. ' +
      '20.1 is the largest movement this route has ever taken for a wave that changed NONE of its source: +2607 B and ' +
      'TWO more requests AGAIN in 21.1 (+713 B, a twelfth file), for a wave that added nothing to this entry — and the same wave GAVE it 32 B back on the bundled size-limit row. A static page and a bundler consumer moved in opposite directions from one change, which is the clearest example on this table of why both instruments exist. Before that, TWO more requests because the new /ui entry re-split the shared chunks this route downloads whole. The advice ' +
      'above therefore holds harder than before — a page needing /bootstrap should take the artifact, which is now ' +
      '3 kB smaller over 1 request than this route is over 10.',
  },

  ui: {
    file: 'dist/esm/ui.js',
    requests: 10,
    measured: 23905,
    budget: 25400,
    why:
      'The application-UX entry (spec 07 NFR-32). +182 B and a TENTH request in 21.1, entirely from the chunk re-split around the new /forms entry — nothing on this entry moved, and the budget is unchanged because it had the room. Before that: +261 B and a NINTH request in 20.6, for the F111 reduced-motion helper - most of the movement is the shared chunks re-splitting, not the helper itself, which lives on /dom and is imported by nothing here. Before that: +4 612 B and TWO more requests in 20.3, and the cause is worth reading: the F106 theme manager persists through the F21 storage wrapper, which a bundler consumer pays 1 464 B for and a static page pays 4 612 B and two round trips for, because this route downloads whole files. Reusing the wrapper is a spec requirement and the right call - it is also the clearest example on this table of the same decision costing two consumers very different amounts. Before that, +2 178 B in 20.2 for the toast manager, on a route that then cost six requests — the queue and the promise helper landed inside files this route already downloaded whole. Two and a half times its 7 332 B size-limit row, and the gap is the point ' +
      'of this file: a bundler consumer importing `createDialogs` ships the tree-shaken 5 kB, while a static page ' +
      'downloads ui.js plus the five chunks it imports whole — the F70 modal wrapper, the F55/F56 buttons, the F109 ' +
      'focus primitives and the builder contract underneath them. Composition is free for the bundler consumer and ' +
      'billed by the file here.',
  },

  forms: {
    file: 'dist/esm/forms.js',
    requests: 6,
    measured: 5774,
    budget: 6100,
    why:
      'The form engine (spec 08 NFR-43), new in 21.1 at F112-F115. Three times its 1840 B size-limit row, and the ' +
      'ratio is the point rather than a surprise: a bundler consumer importing `createForm` ships the tree-shaken ' +
      '1.8 kB, while a static page downloads forms.js plus the five shared chunks it imports WHOLE — the error ' +
      'taxonomy, the DOM helpers, the native setters, the option-key check and the lifecycle guard. Composition is ' +
      'free for the bundler consumer and billed by the file here, which is the same lesson /ui records one entry up. ' +
      'It is also the cheapest route of the four that need a document, which is what putting the engine on its own ' +
      'entry bought: a form page does not download the Bootstrap catalogue to read a checkbox.',
  },

  // --- The artifact route (F83) --------------------------------------------
  artifact: {
    file: 'dist/global/egl-utils.global.js',
    requests: 1,
    measured: 45552,
    budget: 46400,
    why:
      'Re-pinned for 21.1 (+1178 B for the F112-F115 form engine and the twelfth-entry chunk re-split), holding the ADR-0059 rule. Before that, re-pinned for 20.6 (+160 B for the F111 reduced-motion helper), holding the ADR-0059 rule: this is the file served as-is, which is what a CDN sends, while the size-limit row for the same path reports a smaller number because it re-bundles through esbuild first. Two honest measurements of two different things, kept separate on purpose (ADR-0061). ' +
      "20.5 is where two waves of pressure resolved. NFR-22's ceiling is RE-DERIVED to 52 kB rather than raised, by spec 05's own method — the sum of the measured entry figures, an upper bound on a deduplicated single file, which reads 52104 B today against 39.8 kB at M18. That recomputation, and not a bigger number, is the condition spec 07 NFR-33 attached (ADR-0070). " +
      'The budget here stays tight on purpose: 40400 B is measured + 1.8%, not the ADR-0015 + 7%. The clause is an authoring bound with 12 kB of slack in it — that gap IS the deduplication the derivation always assumed — and a clause with slack does no per-PR work, while this row does. Two instruments, different jobs: the split ADR-0041 already made for the /bootstrap entry. ' +
      '20.3 recomputed it a fourth time (60914 B → 60 kB), 20.6 a FIFTH (61938 B → 62 kB), and 21.1 recomputes it again: the sum now has a TWELFTH input and reads 63862 B, so NFR-22 becomes 64 kB and this row moves to 46.4 kB (measured + 2.0%). The derivation is redone whenever ANY of its inputs moves, not only when an entry is added: a clause nobody recomputes is a number rather than a bound. ' +
      "The sibling constraint moved in the helpful direction for once: ADR-0041's 25 kB /bootstrap clause held at 473 B free through 20.6, and 21.1 leaves 505 B free — the twelfth entry re-split the shared chunks in that entry's favour, without a line of it changing.",
  },
};
